// Session/terminal orchestration around the unchanged CLI; never an installer.
import { readFile, writeFile, rename, mkdir, readdir, lstat, rm, access } from "node:fs/promises";
import { join, dirname, relative, resolve } from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { runInNewContext } from "node:vm";

const requestPath=resolve(process.argv[2]);
const root=dirname(requestPath);
const request=JSON.parse(await readFile(requestPath,"utf8"));
if(request.root!==root||request.plan.id!==root.split(/[\\/]/).at(-1)) throw new Error("Invalid session identity.");
const exists=async path=>{try{await access(path);return true;}catch{return false;}};
async function atomic(name,value) {
  const path=join(root,name),tmp=path+`.${process.pid}.${++sequence}.new`;
  await writeFile(tmp,JSON.stringify(value),{mode:0o600});await rename(tmp,path);
}
let sequence=0;
const cancelled=()=>exists(join(root,"cancel"));
function groupAlive(pid) {if(!pid)return false;try{process.kill(process.platform==="win32"?pid:-pid,0);return true;}catch{return false;}}
function signalGroup(pid,signal) {try{if(process.platform==="win32")spawn("taskkill",["/PID",String(pid),"/T","/F"],{stdio:"ignore"});else process.kill(-pid,signal);}catch{}}
function environment(bridge=false) {
  const env={...process.env,HOME:request.home,USERPROFILE:request.home,TMPDIR:join(root,"tmp"),TMP:join(root,"tmp"),TEMP:join(root,"tmp"),DISABLE_TELEMETRY:"1",GIT_TERMINAL_PROMPT:"0"};
  for(const key of ["AI_AGENT","CLAUDECODE","CLAUDE_CODE","CLAUDE_CODE_IS_COWORK","CODEX_THREAD_ID","CODEX_CI","CODEX_SANDBOX","INSTALL_INTERNAL_SKILLS"])delete env[key];
  const separator=process.platform==="win32"?";":":";
  const paths=[dirname(request.node),...(request.agent_command?[dirname(request.agent_command)]:[]),request.search_path,process.env.PATH].filter(Boolean).join(separator).split(separator).filter(p=>p!==join(root,"bin"));
  env.PATH=[...(bridge?[]:[join(root,"bin")]),...new Set(paths)].join(separator);
  if(request.isolated)for(const key of ["CODEX_HOME","GH_HOST","CLAUDE_CONFIG_DIR","XDG_CONFIG_HOME","XDG_STATE_HOME","VIBE_HOME","HERMES_HOME","GROK_HOME","AUTOHAND_HOME","SARVAM_HOME"])delete env[key];
  return env;
}
async function materialized(prompt) {
  const tmp=join(root,"tmp");
  const candidates=(await readdir(tmp,{withFileTypes:true})).filter(e=>e.isDirectory()&&e.name.startsWith("skills-use-"));
  if(candidates.length!==1)throw new Error("Temporary skill directory was not uniquely prepared.");
  const parent=join(tmp,candidates[0].name);
  const children=await readdir(parent,{withFileTypes:true});
  if(children.length!==1||!children[0].isDirectory())throw new Error("Unexpected temporary skill layout.");
  const skillDir=join(parent,children[0].name);const chunks=[],paths=[];let size=0,count=0;
  function frame(bytes){const n=Buffer.alloc(8);n.writeBigUInt64LE(BigInt(bytes.length));chunks.push(n,bytes);}
  async function visit(path) {
    const entries=await readdir(path,{withFileTypes:true});entries.sort((a,b)=>Buffer.compare(Buffer.from(a.name),Buffer.from(b.name)));
    for(const entry of entries){if(++count>2000)throw new Error("Temporary content exceeds limits.");const full=join(path,entry.name);const info=await lstat(full);if(info.isSymbolicLink())throw new Error("Unexpected temporary link.");
      if(info.isDirectory())await visit(full);
      else if(info.isFile()) {if(info.size>4*1024*1024)throw new Error("Temporary content exceeds limits.");const bytes=await readFile(full);size+=bytes.length;if(size>4*1024*1024)throw new Error("Temporary content exceeds limits.");const name=relative(skillDir,full);paths.push(name);frame(Buffer.from(name));frame(bytes);}
      else throw new Error("Unexpected temporary file type.");
    }
  }
  await visit(skillDir);
  const expected=await readFile(join(root,"expected.bin"));
  if(!Buffer.concat(chunks).equals(expected))throw new Error("Prepared skill content differs from confirmation; Agent was not started.");
  const code=await readFile(request.cli_dist,"utf8");const a=code.indexOf("function buildUsePrompt(input) {"),b=code.indexOf("async function materializeUseSkill(",a);
  if(a<0||b<a)throw new Error("Review pinned use prompt boundaries.");
  const skillMd=await readFile(join(skillDir,"SKILL.md"),"utf8");
  const expectedPrompt=runInNewContext(code.slice(a,b)+"\nbuildUsePrompt(input)",{input:{skillMd,supportDir:skillDir,hasSupportingFiles:paths.some(p=>p.toLowerCase()!=="skill.md")}},{timeout:1000});
  if(prompt!==expectedPrompt)throw new Error("Prepared prompt differs from the original prompt contract.");
  return skillDir;
}

if(process.argv[3]==="--bridge") {
  // Upstream invokes its normal command name. This private, per-session bridge
  // verifies materialization before delegating to the unchanged user command.
  try {
    if(await cancelled())throw new Error("Session cancelled before Agent launch.");
    const args=process.argv.slice(4);if(args.length!==1||!request.agent_command)throw new Error("Invalid Agent invocation.");
    const skillDir=await materialized(args[0]);
    if(await cancelled())throw new Error("Session cancelled before Agent launch.");
    let writes=Promise.resolve(),hasSpawned=false;
    const save=value=>(writes=writes.then(()=>atomic("agent.json",value)));
    const agent=spawn(request.agent_command,args,{cwd:request.plan.workingDirectory,env:environment(true),stdio:"inherit"});
    agent.on("error",async()=>{await save({phase:"failed",verified:true,skillDirectory:skillDir,error:"Agent command could not be started."});process.exitCode=1;});
    agent.on("spawn",()=>{hasSpawned=true;save({phase:"running",verified:true,agentPid:agent.pid,skillDirectory:skillDir});});
    agent.on("close",async(code,signal)=>{await save({phase:hasSpawned?"exited":"failed",verified:true,skillDirectory:skillDir,exitCode:code,signal});process.exitCode=code??1;});
  }catch(error){await atomic("agent.json",{phase:"failed",verified:false,error:error.message});process.stderr.write(`${error.message}\n`);process.exitCode=1;}
}else{
  let owned=false,child=null,timer=null,stopTimer=null,stopping=false,reason=null;
  let status={phase:"preparing",runnerPid:process.pid,cliPid:null,exitCode:null,verified:false,agentStarted:false,skillDirectory:null,error:null};
  const update=async()=>atomic("status.json",status);
  function stop(why){if(stopping)return;stopping=true;reason=why;if(child?.pid){signalGroup(child.pid,"SIGTERM");stopTimer=setTimeout(()=>signalGroup(child.pid,"SIGKILL"),1000);}}
  for(const signal of ["SIGTERM","SIGHUP"])process.on(signal,()=>stop("cancelled"));
  process.on("SIGINT",()=>{if(child?.pid)signalGroup(child.pid,"SIGINT");});
  try{
    await mkdir(join(root,"ownership"));owned=true;
    if(await cancelled()){status.phase="cancelled";await update();}
    else{
      await update();let stdout=Buffer.alloc(0),stderr=Buffer.alloc(0),truncated=false;
      child=spawn(request.node,[request.cli,...request.args],{cwd:request.plan.workingDirectory,env:environment(),stdio:request.plan.mode==="agent"?"inherit":["ignore","pipe","pipe"],detached:process.platform!=="win32"});
      child.stdout?.on("data",chunk=>{if(stdout.length+chunk.length>512*1024){truncated=true;stop("output-limit");}else stdout=Buffer.concat([stdout,chunk]);});
      child.stderr?.on("data",chunk=>{if(stderr.length<64*1024)stderr=Buffer.concat([stderr,chunk.subarray(0,64*1024-stderr.length)]);});
      const outcome=new Promise((resolve,reject)=>{child.once("error",reject);child.once("close",(code,signal)=>resolve({code,signal}));});
      status.cliPid=child.pid??null;
      try{status.cliStart=execFileSync("ps",["-p",String(child.pid),"-o","lstart="],{encoding:"utf8"}).trim();}catch{}
      await update();
      const started=Date.now();let agentLaunched=false;
      timer=setInterval(async()=>{
        if(await cancelled())stop("cancelled");
        if(request.plan.mode==="agent"&&!agentLaunched)try{const a=JSON.parse(await readFile(join(root,"agent.json"),"utf8"));agentLaunched=["running","exited"].includes(a.phase);}catch{}
        if(!agentLaunched&&Date.now()-started>120000)stop("timeout");
      },100);
      const {code,signal}=await outcome;
      clearInterval(timer);timer=null;
      // Preserve upstream-launched background jobs after normal CLI exit. Keep the
      // controller and support files until they finish or the user explicitly stops.
      if(groupAlive(child.pid)&&!stopping){
        status.phase="background";status.exitCode=code;
        if(request.plan.mode==="agent")try{const a=JSON.parse(await readFile(join(root,"agent.json"),"utf8"));status.verified=a.verified===true;status.agentStarted=["running","exited"].includes(a.phase);status.skillDirectory=a.skillDirectory??null;}catch{}
        await update();
        await new Promise(resolve=>{timer=setInterval(async()=>{if(await cancelled())stop("cancelled");if(!groupAlive(child.pid)){clearInterval(timer);timer=null;resolve();}},100);});
      }
      if(groupAlive(child.pid)&&stopping){signalGroup(child.pid,"SIGTERM");await new Promise(r=>setTimeout(r,1000));signalGroup(child.pid,"SIGKILL");}
      if(stopTimer){clearTimeout(stopTimer);stopTimer=null;}
      status.exitCode=code;status.signal=signal;
      if(request.plan.mode==="agent") {
        let agent={};try{agent=JSON.parse(await readFile(join(root,"agent.json"),"utf8"));}catch{}
        status.verified=agent.verified===true;status.agentStarted=["running","exited"].includes(agent.phase);status.skillDirectory=agent.skillDirectory??null;
        status.phase=reason==="cancelled"?"cancelled":code===0&&status.agentStarted&&status.verified?"exited":"failed";
        status.error=reason==="timeout"?"Skill preparation timed out before Agent launch.":agent.error??(status.phase==="failed"?"Agent session did not finish successfully. Review the terminal and exit status.":null);
      }else if(reason){status.phase=reason==="cancelled"?"cancelled":"failed";status.error=reason==="timeout"?"Prompt preparation timed out.":reason==="output-limit"?"Prompt exceeds limits.":null;}
      else if(code===0&&!truncated){status.skillDirectory=await materialized(stdout.toString("utf8"));await writeFile(join(root,"prompt.txt"),stdout,{mode:0o600});status.phase="ready";status.verified=true;}
      else {status.phase="failed";status.error="Prompt preparation failed. Review diagnostic output.";}
      if(stderr.length)await writeFile(join(root,"diagnostic.txt"),stderr,{mode:0o600});
      await update();
    }
  }catch(error){if(owned){status.phase="failed";status.error=error.message;await update().catch(()=>{});}else process.stderr.write("Session was already claimed or released.\n");}
  finally{if(timer)clearInterval(timer);if(stopTimer)clearTimeout(stopTimer);if(owned)await rm(join(root,"ownership"),{recursive:true,force:true});}
}
