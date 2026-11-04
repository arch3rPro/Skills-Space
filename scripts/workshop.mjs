// Native workbench storage and original Agent orchestration. No skill installer lives here.
import { readFile, writeFile, mkdir, readdir, lstat, stat, realpath, rename, access, rm } from 'node:fs/promises';
import { resolve, join, relative, isAbsolute, delimiter, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sarvamTurn } from './workshop-sarvam.mjs';

const AGENTS = [
  { id:'codex', name:'Codex', command:'codex' },
  { id:'pi', name:'Pi', command:'pi' },
  { id:'claude-code', name:'Claude Code', command:'claude' },
  { id:'sarvam-code', name:'Sarvam Code', command:'sarvam-code' },
];
const supportedAgent = id => AGENTS.some(agent => agent.id === id);

const CREATOR = 'https://github.com/anthropics/skills/tree/ca45fc496a3436251f191354091d557da31c15b5/skills/skill-creator';
const stopping = new Map();
const PLAN_READY = '<!-- skills-space:plan-ready -->';
const SCOPE_CHANGE = '<!-- skills-space:scope-change -->';
const busyPhases = new Set(['preparing', 'running', 'stopping']);
const textTypes = /\.(?:md|txt|json|yaml|yml|toml|py|js|mjs|ts|sh|csv|html|css|xml)$/i;
export async function atomic(path, value) {
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(value), { mode: 0o600 });
  await rename(temp, path);
}
async function json(path) { const info=await lstat(path);if(!info.isFile()||info.isSymbolicLink()||info.size>8*1024*1024)throw new Error('Invalid workshop record.');return JSON.parse(await readFile(path, 'utf8')); }
async function atomicText(path,text){const parent=await lstat(dirname(path));if(!parent.isDirectory()||parent.isSymbolicLink())throw new Error('Invalid workshop file directory.');const temp=`${path}.${randomUUID()}.tmp`;await writeFile(temp,text,{mode:0o600,flag:'wx'});await rename(temp,path);}
async function realDirectory(path){await mkdir(path,{recursive:true,mode:0o700});const info=await lstat(path);if(!info.isDirectory()||info.isSymbolicLink())throw new Error('Workshop storage must use a real directory.');}
async function exists(path) { try { await access(path); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } }
function inside(root, path) { const part = relative(root, path); return part === '' || !part.startsWith(`..`) && !isAbsolute(part); }
export async function draftRoot(base, id) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid workshop identity.');
  const root = join(base, 'drafts', id);
  if ((await lstat(root)).isSymbolicLink() || !(await lstat(root)).isDirectory()) throw new Error('Invalid workshop directory.');
  if (!inside(await realpath(join(base, 'drafts')), await realpath(root))) throw new Error('Workshop directory is outside its storage root.');
  return root;
}
export async function files(root, folder = '', result = []) {
  const path = join(root, folder);
  if (!await exists(path)) return result;
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const part = folder ? `${folder}/${entry.name}` : entry.name;
    if (!folder && !['PLAN.md', 'CREATION.md', 'skill', 'input', 'review'].includes(entry.name)) continue;
    if (result.length >= 512) throw new Error('The workshop contains too many files to display.');
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) await files(root, part, result);
    else if (entry.isFile()) {
      const info = await lstat(join(root, part));
      result.push({ path: part, size: info.size, modified: info.mtimeMs, readable: info.size <= 512 * 1024 && textTypes.test(part) });
    }
  }
  return result.sort((a,b) => a.path.localeCompare(b.path));
}
export async function readDraft(base, id, activeId = null) {
  const root = await draftRoot(base, id), record = await json(join(root, 'draft.json'));
  if (record.id !== id || !supportedAgent(record.agent)) throw new Error('Invalid workshop record.');
  const entries = await files(root);
  const skillFiles = entries.filter(f => /^skill\/[^/]+\/SKILL\.md$/.test(f.path));
  const skillFile = skillFiles.length === 1 ? skillFiles[0].path : null;
  const status = busyPhases.has(record.run?.phase) && activeId !== id ? { ...record.run, phase: 'interrupted', activity: '' } : record.run;
  return { ...record, run: status, directory: root, files: entries, skillFile, skillDirectory: skillFile ? dirname(join(root, skillFile)) : null, updated: Math.max(record.updated, ...entries.map(f => f.modified)) };
}
export async function readDocument(base, id, path) {
  const root = await draftRoot(base, id);
  if (typeof path !== 'string' || !path || isAbsolute(path) || path.includes('\\') || path.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('Invalid workshop file path.');
  const entry = (await files(root)).find(f => f.path === path);
  if (!entry?.readable) throw new Error('This file cannot be previewed as text.');
  const actual = await realpath(join(root, path));
  if (!inside(await realpath(root), actual)) throw new Error('The file is outside this workshop.');
  return readFile(actual, 'utf8');
}
export async function createDraft(base, input) {
  const title = String(input.title ?? '').trim(), brief = String(input.brief ?? '').trim(), description = String(input.description ?? '').trim();
  if (!title || title.length > 80 || !brief || brief.length > 8000 || description.length > 1000 || !supportedAgent(input.agent)) throw new Error('Enter a name, requirements and a supported Agent.');
  const id = randomUUID(), root = join(base, 'drafts', id);
  await mkdir(join(root, 'input'), { recursive: true, mode: 0o700 });
  await mkdir(join(root, 'skill'), { mode: 0o700 });
  const record = { id, title, description, brief, agent: input.agent, updated: Date.now(), messages: [], stage: 'draft', run: null, session: null };
  await atomicText(join(root, 'CREATION.md'), brief);
  await atomic(join(root, 'draft.json'), record);
  return readDraft(base, id);
}
export async function agentCommands(home, pathValue = process.env.PATH ?? '') {
  const paths = [...new Set([...pathValue.split(delimiter), join(home,'.local/bin'), join(home,'.cargo/bin'), '/opt/homebrew/bin', '/usr/local/bin'])];
  return Promise.all(AGENTS.map(async ({id,name:label,command}) => {
    for (const path of paths) {
      for(const name of process.platform==='win32'?[`${command}.exe`,`${command}.cmd`]:[command]){const candidate=join(path,name);
      try { const info = await stat(candidate); if (info.isFile() && (process.platform === 'win32' || info.mode & 0o111)) return { id, name:label, available: true, path: candidate }; } catch (e) { if (!['ENOENT','ENOTDIR'].includes(e.code)) throw e; }}
    }
    return { id, name:label, available: false, path: null };
  }));
}
export function protocol(agent, record) {
  if (agent === 'codex') {
    if (record.type === 'thread.started') return { session: record.thread_id };
    if (record.type === 'item.completed' && record.item?.type === 'agent_message') return { text: record.item.text, final: true };
    if (record.type === 'item.started' || record.type === 'item.completed') return { activity: record.item?.type === 'command_execution' ? record.item.command : record.item?.type === 'file_change' ? 'Updating files' : '' };
    if (record.type === 'turn.completed') return { done: true };
    if (record.type === 'turn.failed' || record.type === 'error') return { error: record.error?.message ?? record.message ?? 'Codex failed.' };
  } else if (agent === 'claude-code') {
    if (record.parent_tool_use_id) return {};
    if (record.type === 'system' && record.subtype === 'init') return { session: record.session_id };
    if (record.type === 'stream_event') {
      if (record.event?.type === 'content_block_delta' && record.event.delta?.type === 'text_delta') return { delta: record.event.delta.text };
      if (record.event?.type === 'content_block_start' && record.event.content_block?.type === 'tool_use') return { activity: record.event.content_block.name };
    }
    if (record.type === 'assistant') return { activity:'', text: (record.message?.content || []).filter(part => part.type === 'text').map(part => part.text).join('\n'), final: true };
    if (record.type === 'result') {
      if (record.is_error || record.subtype !== 'success' || record.permission_denials?.length) return { session: record.session_id, error: record.errors?.join('\n') || record.result || 'Claude Code could not complete the requested action.' };
      return { session: record.session_id, ...(typeof record.result === 'string' ? { text: record.result, final:true } : {}), done: true };
    }
  } else if (agent === 'pi') {
    if (record.type === 'response' && record.success === false) return { error: record.error ?? 'Pi rejected the request.' };
    if (record.type === 'message_update' && record.assistantMessageEvent?.type === 'text_delta') return { delta: record.assistantMessageEvent.delta };
    if (record.type === 'message_end' && record.message?.role === 'assistant') {
      if (['error','aborted'].includes(record.message.stopReason)) return { error: record.message.errorMessage ?? 'Pi stopped before completing the reply.' };
      return { text: (record.message.content ?? []).filter(c => c.type === 'text').map(c => c.text).join('\n'), final: true };
    }
    if (record.type === 'tool_execution_start') return { activity: `${record.toolName}${record.args?.path ? ` · ${record.args.path}` : ''}` };
    if (record.type === 'tool_execution_end') return { activity: '' };
    if (record.type === 'agent_settled') return record.aborted ? { error: 'Pi aborted the task.' } : { done: true };
    if (record.type === 'extension_ui_request') return { error: 'Pi requires an interactive extension response. Open this Agent in its terminal to complete that interaction.' };
    if (record.type === 'response' && record.command === 'prompt' && record.data?.disposition === 'handled') return { done: true };
  }
  return {};
}
export function agentArguments(agent, record, planning=false) {
  if (agent === 'sarvam-code') return ['app-server','-c','approval_policy="never"','-c',`sandbox_mode="${planning?'read-only':'workspace-write'}"`];
  if (agent === 'claude-code') return ['--print','--output-format','stream-json','--verbose','--include-partial-messages','--strict-mcp-config','--mcp-config','{}','--permission-mode',planning?'dontAsk':'acceptEdits','--tools',planning?'Read,Glob,Grep':'Read,Glob,Grep,Write,Edit,Bash','--allowedTools','Read,Glob,Grep'+(planning?'':',Write,Edit'),...(record.session?['--resume',record.session]:[])];
  if (agent === 'pi') return ['--mode','rpc','--session-id',`workshop-${record.id}`, ...(planning?['--tools','read,grep,find,ls','--no-mcp']:[])];
  return ['exec','--sandbox',planning?'read-only':'workspace-write','--json','--skip-git-repo-check', ...(record.session ? ['resume',record.session,'-'] : ['-'])];
}
function stopProcess(child) {
  if (!child?.pid || stopping.has(child)) return;
  const finished = new Promise(resolveStop => {
    if (process.platform === 'win32') {
      const killer = spawn('taskkill',['/pid',String(child.pid),'/t','/f'],{ windowsHide:true, stdio:'ignore' });
      killer.once('error',resolveStop);killer.once('close',resolveStop);return;
    }
    try { process.kill(-child.pid,'SIGTERM'); } catch(e) { if(e.code==='ESRCH'){resolveStop();return;} }
    setTimeout(()=>{try {process.kill(-child.pid,'SIGKILL');} catch(e) {if(e.code!=='ESRCH')process.stderr.write(e.message);}resolveStop();},2000);
  });
  stopping.set(child,finished);
}
export async function launcher(command,args) {
  if(!command.toLowerCase().endsWith('.cmd'))return {command,args};
  const shim=await readFile(command,'utf8');
  const match=shim.match(/"%dp0%[\\/]([^"\r\n]+\.(?:m?js))"/i);
  if(!match)throw new Error('The Agent launcher is not a supported npm command shim.');
  const script=resolve(dirname(command),match[1].replace(/\\/g,'/'));
  if(!(await lstat(script)).isFile())throw new Error('The Agent launcher target is missing.');
  return {command:process.execPath,args:[script,...args]};
}
function agentEnvironment() {
  const env={...process.env};
  for(const key of ['AI_AGENT','CLAUDECODE','CLAUDE_CODE','CLAUDE_CODE_IS_COWORK','CODEX_THREAD_ID','CODEX_CI','CODEX_SANDBOX','INSTALL_INTERNAL_SKILLS'])delete env[key];
  return env;
}
async function originalPrompt(request, root, cancelled) {
  const cache = join(root,'.creator'); await realDirectory(cache);await realDirectory(join(cache,'tmp'));
  const file = join(cache,'prompt.txt');
  // The upstream use output contains real resource paths; cache only while they still exist.
  if (await exists(file)) {
    const prompt = await readFile(file,'utf8');
    const resources = /Supporting files for this skill were downloaded to:\s*\n([^\n]+)/.exec(prompt)?.[1]?.trim();
    if (resources && await exists(resources)) return prompt;
  }
  return new Promise((resolvePrompt,reject) => {
    const child = spawn(process.execPath,[request.cli,'use',CREATOR,'--skill','skill-creator'],{cwd:root, env:{...agentEnvironment(),TMPDIR:join(cache,'tmp'),TMP:join(cache,'tmp'),TEMP:join(cache,'tmp'),DISABLE_TELEMETRY:'1',GIT_TERMINAL_PROMPT:'0'},detached:process.platform!=='win32',windowsHide:true});
    let stdout='', stderr='';
    const timeout = setTimeout(()=>{stopProcess(child);reject(new Error('Skill preparation timed out.'));},60000);
    const cancel = setInterval(()=>{if(cancelled()){stopProcess(child);reject(new Error('Stopped.'));}},250);
    child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{stdout+=chunk;if(stdout.length>512*1024)stopProcess(child);});
    child.stderr.setEncoding('utf8');child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-12000);});
    child.once('error',reject);
    child.once('close',async code=>{clearTimeout(timeout);clearInterval(cancel);try {if(code!==0 || !stdout.trim() || stdout.length>512*1024)throw new Error(stderr || 'Original skills use could not prepare skill-creator.');await atomicText(file,stdout);resolvePrompt(stdout);}catch(e){reject(e);}});
  });
}
export async function runTurn(request) {
  const root = await draftRoot(request.base,request.id), record = await json(join(root,'draft.json'));
  const runId = record.run?.phase==='preparing'?record.run.id:randomUUID(), stopFile = join(root,'.stop');
  let stopped=false, agentChild, sarvam, parentGone=false;
  const stopAgent=()=>{if(!sarvam?.stop())stopProcess(agentChild);};
  const watch = setInterval(async()=>{try {stopped=await exists(stopFile);if(request.parentPid){try{process.kill(request.parentPid,0);}catch{parentGone=true;}}if(stopped||parentGone)stopAgent();}catch(e){stopped=true;stopAgent();}},250);
  const save=()=>atomic(join(root,'draft.json'),record);
  const message = String(request.message ?? '').trim();
  const approved = request.kind === 'build';
  if(!message || message.length>16000 || !['plan','chat','build'].includes(request.kind)) {clearInterval(watch);throw new Error('Invalid workshop request.');}
  const latestPlan = await exists(join(root,'PLAN.md')) ? await readFile(join(root,'PLAN.md'),'utf8') : '';
  if(approved && (!latestPlan || request.plan !== latestPlan)) {clearInterval(watch);throw new Error('The plan changed. Reopen it before confirming.');}
  record.messages.push({id:randomUUID(),role:'user',text:message});
  record.run={id:runId,phase:'preparing',activity:'Preparing skill-creator',startedAt:Date.now(),error:null};record.updated=Date.now();await save();
  try {
    const prompt=await originalPrompt(request,root,()=>stopped||parentGone);
    if(stopped||parentGone)throw new Error('Stopped.');
    await atomicText(join(root,'.creator','INSTRUCTIONS.md'),prompt);
    if(approved) {await atomicText(join(root,'.approved-plan.md'),latestPlan);record.stage='building';}
    const commands=await agentCommands(request.home);
    const command=commands.find(a=>a.id===record.agent)?.path;if(!command)throw new Error(`${record.agent} is not installed or is not executable.`);
    const planning = !approved && ['draft','planning','planned'].includes(record.stage);
    const first = !record.session && record.messages.filter(m=>m.role==='assistant').length===0;
    const instruction=[
      first ? 'Read .creator/INSTRUCTIONS.md for the original skill-creator instructions, and CREATION.md for the user requirements. Use their supporting resources at the exact paths provided.' : 'Continue this skill creation in the current workshop directory. Read CREATION.md for the current requirements.',
      'Output one portable Agent Skill under skill/<name>/ with SKILL.md and any needed relative resources. Do not install skills, edit Agent settings, access credentials, run evaluations or use Git. Do not write outside this workshop.',
      approved ? 'The user has explicitly approved the exact plan saved in .approved-plan.md. Build it now.' : record.stage==='draft' || record.stage==='planning' || record.stage==='planned' ? 'Prepare or revise the complete plan as your reply in Markdown, including behavior, input, output example and exact files. Tools are read-only in this phase. The App saves your completed reply as PLAN.md; do not attempt to write it yourself. DO NOT create or modify skill/. Ask for clarification in your reply when requirements are unclear. When and only when this is a complete plan ready for user confirmation, end the complete Markdown plan with <!-- skills-space:plan-ready -->. Do not add that marker to clarification questions.' : 'Make small edits directly within the approved plan. If the requested goal, output contract, dependencies or file scope changes, return the complete revised plan in Markdown with its scope changes and exact files, end it with <!-- skills-space:scope-change -->, and do not edit any skill files. The App saves that proposed plan and requests explicit confirmation. Do not edit PLAN.md for ordinary small changes.',
      'Ask clarification questions as ordinary text, not interactive tool forms. Reply in the same language as the user, with concrete results and relative file references. Do not claim files were created unless you actually wrote them.',
      `User message:\n${message}`
    ].join('\n\n');
    if(planning)record.stage='planning';
    const reply={id:randomUUID(),role:'assistant',text:''};record.messages.push(reply);record.run.phase='running';record.run.activity='';await save();
    const result=await new Promise((resolveRun,reject)=>{
      void launcher(command,agentArguments(record.agent,record,planning)).then(launch=>{
      agentChild=spawn(launch.command,launch.args,{cwd:root,env:agentEnvironment(),detached:process.platform!=='win32',windowsHide:true});
      let buffer='',stderr='',done=false,error=null,saveQueue=Promise.resolve(), lastSaved=0;
      const persist=()=>{saveQueue=saveQueue.then(save);};
      const handleEvent=event=>{
        if(event.session)record.session=event.session;
        if(event.error){error=event.error;stopProcess(agentChild);}
        if(event.delta)reply.text+=event.delta;
        if(event.final && event.text!==undefined)reply.text=event.text;
        if(event.activity!==undefined)record.run.activity=event.activity;
        if(event.done){
          if(record.agent==='claude-code'&&(typeof record.session!=='string'||!record.session.trim())){error='Claude Code completed without a session identity; this conversation cannot be resumed.';stopProcess(agentChild);}
          else {done=true;if(record.agent==='pi')agentChild.stdin.end();}
        }
        if(Date.now()-lastSaved>=200){lastSaved=Date.now();persist();}
      };
      if(record.agent==='sarvam-code')sarvam=sarvamTurn({session:record.session,cwd:root,planning,instruction,write:message=>agentChild.stdin.write(JSON.stringify(message)+'\n'),end:()=>agentChild.stdin.end(),onEvent:handleEvent,onError:message=>{error=message;},kill:()=>stopProcess(agentChild)});
      agentChild.stdout.setEncoding('utf8');agentChild.stdout.on('data',chunk=>{
        buffer+=chunk;
        if(buffer.length>2*1024*1024){error='Agent response exceeded the event limit.';stopProcess(agentChild);return;}
        let index;while((index=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,index).replace(/\r$/,'');buffer=buffer.slice(index+1);if(!line.trim())continue;
          try{const event=JSON.parse(line);if(sarvam)sarvam.receive(event);else handleEvent(protocol(record.agent,event));}
          catch(e){error=`Invalid ${record.agent} event: ${e.message}`;stopProcess(agentChild);}
        }
      });
      agentChild.stdin.on('error',error=>{stopProcess(agentChild);reject(error);});
      agentChild.stderr.setEncoding('utf8');agentChild.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-12000);});
      agentChild.once('error',reject);
      agentChild.once('close',async code=>{sarvam?.close();try{persist();await saveQueue;if(stopped||parentGone)throw new Error('Stopped.');if(error)throw new Error(error);if(!done||record.agent!=='sarvam-code'&&code!==0)throw new Error(stderr||'Agent exited without a completed response.');resolveRun();}catch(e){reject(e);}});
      if(sarvam)sarvam.start();else if(record.agent==='pi')agentChild.stdin.write(JSON.stringify({id:runId,type:'prompt',message:instruction})+'\n');else agentChild.stdin.end(instruction);
      }).catch(reject);
    });
    void result;
    const ready=planning&&reply.text.includes(PLAN_READY), expanded=!planning&&reply.text.includes(SCOPE_CHANGE);
    reply.text=reply.text.replaceAll(PLAN_READY,'').replaceAll(SCOPE_CHANGE,'').trim();
    if(ready||expanded){await atomicText(join(root,'PLAN.md'),reply.text);record.stage='planned';}
    else if(planning)record.stage='draft';
    if(record.stage==='building'){const skills=(await files(root)).filter(f=>/^skill\/[^/]+\/SKILL\.md$/.test(f.path));if(skills.length!==1)throw new Error(skills.length?'More than one skill was generated. Keep one main skill in this draft.':'The Agent finished without creating SKILL.md. Continue the conversation to complete the skill.');record.stage='ready';}
    record.run.phase='complete';
  } catch(e) {if(approved&&record.stage==='building')record.stage='planned';record.run.phase=stopped||parentGone?'stopped':'failed';record.run.error=stopped||parentGone?null:e.message;}
  finally {clearInterval(watch);await Promise.all(stopping.values());record.run.activity='';record.run.finishedAt=Date.now();record.updated=Date.now();await save();await rm(stopFile,{force:true});}
}
export async function command(request) {
  const bases=[],seenBases=new Set();
  for(const path of [request.base,...(request.bases||[])]){const normalized=resolve(path);const key=await exists(normalized)?await realpath(normalized):normalized;if(!seenBases.has(key)){seenBases.add(key);bases.push(key);}}
  request={...request,base:bases[0]};
  if(request.id){
    const matches=[];
    for(const base of bases)if(await exists(join(base,'drafts',request.id)))matches.push(base);
    if(matches.length>1)throw new Error('This creation identity exists in more than one workshop directory.');
    if(matches.length)request={...request,base:matches[0]};
  }
  if(request.action==='create')await mkdir(join(request.base,'drafts'),{recursive:true,mode:0o700});
  if(request.action==='validate'){const root=await draftRoot(request.base,request.id);const record=await json(join(root,'draft.json'));if(!['plan','chat','build'].includes(request.kind)||typeof request.message!=='string'||!request.message.trim()||request.message.length>16000)throw new Error('Enter a message of at most 16000 characters.');if(request.kind==='build'&&(record.stage!=='planned'||request.plan!==await readFile(join(root,'PLAN.md'),'utf8')))throw new Error('The plan changed. Reopen it before confirming.');if(!(await agentCommands(request.home)).find(a=>a.id===record.agent)?.available)throw new Error('The selected Agent is not installed or is not executable.');await rm(join(root,'.stop'),{force:true});record.run={id:randomUUID(),phase:'preparing',activity:'',error:null,startedAt:Date.now()};await atomic(join(root,'draft.json'),record);return null;}
  if(request.action==='fail'){const root=await draftRoot(request.base,request.id),record=await json(join(root,'draft.json'));record.run={...record.run,phase:'failed',error:request.error,finishedAt:Date.now()};await atomic(join(root,'draft.json'),record);return null;}
  if(request.action==='agents')return agentCommands(request.home);
  if(request.action==='create')return createDraft(request.base,request.input);
  if(request.action==='update'){
    const root=await draftRoot(request.base,request.id),record=await json(join(root,'draft.json')),input=request.input;
    if(busyPhases.has(record.run?.phase)&&request.activeId===request.id)throw new Error('Wait for the current task before editing creation information.');
    const title=String(input.title??'').trim(),description=String(input.description??'').trim();
    if(!title||title.length>80||description.length>1000)throw new Error('Enter a name and a description of at most 1000 characters.');
    record.title=title;record.description=description;record.updated=Date.now();
    await atomic(join(root,'draft.json'),record);
    return readDraft(request.base,request.id,request.activeId);
  }
  if(request.action==='detail'){
    const draft=await readDraft(request.base,request.id,request.activeId);
    const report=draft.files.find(file=>file.path==='review/report.md');
    const [content,review]=await Promise.allSettled([draft.skillFile?readDocument(request.base,request.id,draft.skillFile):Promise.resolve(''),report?readDocument(request.base,request.id,report.path):Promise.resolve('')]);
    return {...draft,content:content.status==='fulfilled'?content.value:'',contentError:content.status==='rejected'?String(content.reason):null,report:review.status==='fulfilled'?review.value:'',reportError:review.status==='rejected'?String(review.reason):null};
  }
  if(request.action==='read')return readDraft(request.base,request.id,request.activeId);
  if(request.action==='document')return readDocument(request.base,request.id,request.path);
  if(request.action==='directory')return request.skill?(await readDraft(request.base,request.id)).skillDirectory||draftRoot(request.base,request.id):draftRoot(request.base,request.id);
  if(request.action==='stop'){const root=await draftRoot(request.base,request.id);await atomicText(join(root,'.stop'),'stop');return null;}
  if(request.action==='run'){await runTurn(request);return null;}
  if(request.action==='list') {
    const drafts=[],ids=new Set();
    for(const base of bases){
      if(!await exists(join(base,'drafts')))continue;
      for(const entry of await readdir(join(base,'drafts'),{withFileTypes:true})){
        if(!entry.isDirectory()||entry.isSymbolicLink())continue;
        if(ids.has(entry.name))throw new Error('This creation identity exists in more than one workshop directory.');
        const draft=await readDraft(base,entry.name,request.activeId);ids.add(entry.name);drafts.push(draft);
      }
    }
    return drafts.sort((a,b)=>b.updated-a.updated);
  }
  throw new Error('Unknown workshop action.');
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{let input='';for await(const chunk of process.stdin)input+=chunk;const result=await command(JSON.parse(input));process.stdout.write(JSON.stringify(result));}
  catch(e){process.stderr.write(e.message);process.exitCode=1;}
}
