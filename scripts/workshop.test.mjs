import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, chmod, copyFile, stat, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { command, createDraft, readDraft, readDocument, runTurn, launcher, agentCommands } from './workshop.mjs';

async function isolated(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'skills-space-workshop-')));
  t.after(() => rm(root, { recursive:true, force:true }));
  const base = join(root,'workshop'), home = join(root,'home'), bin = join(home,'.local','bin');
  await mkdir(bin,{recursive:true});
  return { root, base, home, bin };
}
const userInput = agent => ({ title:'会议纪要',brief:'保留原文负责人和日期，区分决定与建议。',agent });
async function fakeAgents(context) {
  const cli=join(context.root,'original-use.mjs');
  await writeFile(cli, `import {mkdirSync,appendFileSync} from 'node:fs';import {join} from 'node:path';
const dir=join(process.env.TMPDIR,'skills-use-test','skill-creator');mkdirSync(dir,{recursive:true});
appendFileSync(join(process.cwd(),'.creator-preparations'),'use\\n');
process.stdout.write('You are being given a Skill to execute.\\nSupporting files for this skill were downloaded to:\\n'+dir+'\\n\\nWhen the SKILL.md references relative paths, read them from that directory.\\n');`);
  const body = '#!'+process.execPath+'\n'+String.raw`
const fs=require('node:fs'),path=require('node:path');
const args=process.argv.slice(2),name=path.basename(process.argv[1]),pi=name==='pi',claude=name==='claude',sarvam=name==='sarvam-code';
const session='00000000-0000-4000-8000-000000000001';
const mode=fs.existsSync('.test-mode')?fs.readFileSync('.test-mode','utf8'):'normal';
let hold,threadId=session,turnId='turn-1';
fs.appendFileSync('.agent-arguments',JSON.stringify(args)+'\n');
const emit=value=>process.stdout.write(JSON.stringify(value)+'\r\n');
function identity(){if(claude){if(mode!=='identity')emit({type:'system',subtype:'init',session_id:session});}else if(!pi)emit({type:'thread.started',thread_id:session});}
function wait(){process.on('SIGTERM',()=>{});fs.writeFileSync('.agent-started',String(process.pid));hold=setInterval(()=>{},1000);}
function content(planning){
if(!planning&&mode!=='scope'){fs.mkdirSync('skill/meeting-notes/references',{recursive:true});fs.writeFileSync('skill/meeting-notes/SKILL.md','---\nname: meeting-notes\ndescription: Meeting notes.\n---\n# Meeting notes\n');fs.writeFileSync('skill/meeting-notes/references/template.md','# Template\n');}
return mode==='scope'?'# 修改方案\n\n将输出改为 JSON。\n<!-- skills-space:scope-change -->':planning?'# 构建方案\n\n区分决定与建议。\u2028保留原日期。\n<!-- skills-space:plan-ready -->':'已生成 skill/meeting-notes/SKILL.md。';
}
function respond(){
identity();
if(mode==='wait'){wait();return;}
if(mode==='reject'){emit(pi?{type:'response',command:'prompt',success:false,error:'Provider unavailable'}:claude?{type:'result',subtype:'error_during_execution',is_error:true,session_id:session,errors:['Provider unavailable']}:{type:'turn.failed',error:{message:'Provider unavailable'}});return;}
const planning=args.includes('read-only')||args.includes('read,grep,find,ls')||claude&&args.includes('Read,Glob,Grep');
const text=content(planning);
if(pi){emit({type:'response',command:'prompt',success:true,data:{disposition:'started'}});emit({type:'message_update',assistantMessageEvent:{type:'text_delta',delta:'尚未完成的片段'}});emit({type:'message_end',message:{role:'assistant',stopReason:'stop',content:[{type:'text',text}]}});if(mode!=='incomplete')emit({type:'agent_settled',aborted:false});}
else if(claude){emit({type:'stream_event',parent_tool_use_id:null,event:{type:'content_block_delta',delta:{type:'text_delta',text:'尚未完成的片段'}}});emit({type:'assistant',parent_tool_use_id:'other-agent',message:{content:[{type:'text',text:'不得覆盖主会话'}]}});emit({type:'assistant',parent_tool_use_id:null,message:{content:[{type:'text',text}]}});if(mode!=='incomplete')emit({type:'result',subtype:'success',is_error:false,...(mode==='identity'?{}:{session_id:session}),result:text});}
else{emit({type:'item.completed',item:{type:'agent_message',text}});if(mode!=='incomplete')emit({type:'turn.completed'});}
if(mode==='incomplete')process.exit(0);
}
function rpc(message){
fs.appendFileSync('.sarvam-requests',JSON.stringify(message)+'\n');
if(message.method==='initialize'){emit(mode==='reject'?{id:message.id,error:{code:-32000,message:'Provider unavailable'}}:{id:message.id,result:{userAgent:'original-sarvam-simulation'}});}
else if(message.method==='thread/start'||message.method==='thread/resume'){threadId=message.params.threadId||session;emit({id:message.id,result:{thread:{id:threadId}}});}
else if(message.method==='turn/start'){
 emit({id:message.id,result:{turn:{id:turnId}}});emit({method:'turn/started',params:{threadId,turn:{id:turnId}}});
 if(mode==='wait'){wait();return;}
 if(mode==='approval'){emit({id:99,method:'item/fileChange/requestApproval',params:{threadId,turnId}});return;}
 const planning=args.some(arg=>arg.includes('read-only')),text=content(planning);
 emit({method:'item/agentMessage/delta',params:{threadId:'foreign-thread',turnId,delta:'不得进入主对话'}});
 emit({method:'item/agentMessage/delta',params:{threadId,turnId,delta:'尚未完成的片段'}});
 emit({method:'item/completed',params:{threadId,turnId,item:{type:'agentMessage',text}}});
 emit({method:'turn/completed',params:{threadId,turn:{id:'foreign-turn',status:'completed'}}});
 if(mode==='incomplete')process.exit(0);
 emit({method:'turn/completed',params:{threadId,turn:{id:turnId,status:'completed'}}});
}else if(message.method==='turn/interrupt'){
 fs.writeFileSync('.sarvam-interrupt',JSON.stringify(message.params));emit({id:message.id,result:{}});emit({method:'turn/completed',params:{threadId,turn:{id:turnId,status:'interrupted'}}});
}
}
if(pi||sarvam){let input='';process.stdin.on('data',chunk=>{input+=chunk;let split;while((split=input.indexOf('\n'))>=0){const line=input.slice(0,split);input=input.slice(split+1);if(line.trim())sarvam?rpc(JSON.parse(line)):respond();}});process.stdin.on('end',()=>clearInterval(hold));}
else{process.stdin.resume();process.stdin.on('end',respond);}
`;
  for(const name of ['codex','pi','claude','sarvam-code']) {const file=join(context.bin,name);await writeFile(file,body);await chmod(file,0o755);}
  return cli;
}
async function waitFor(path,limit=3000) {
  const start=Date.now();while(Date.now()-start<limit){try{return await readFile(path,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}await new Promise(resolve=>setTimeout(resolve,20));}
  throw new Error('The simulated Agent did not start within the expected time.');
}

test('draft records reread real files, preserve external edits and reject outside paths',async t=>{
  const context=await isolated(t), draft=await createDraft(context.base,userInput('codex'));
  assert.equal(draft.title,'会议纪要');assert.equal(draft.skillFile,null);
  assert.equal(await readDocument(context.base,draft.id,'CREATION.md'),userInput('codex').brief);
  const root=draft.directory;
  await mkdir(join(root,'skill','meeting-notes'),{recursive:true});
  await writeFile(join(root,'skill','meeting-notes','SKILL.md'),'# Actual source\n');
  await mkdir(join(root,'skill','meeting-notes','references','example'),{recursive:true});
  await writeFile(join(root,'skill','meeting-notes','references','example','SKILL.md'),'# Example document, not a second skill\n');
  const reread=await command({base:context.base,home:context.home,action:'list'});
  assert.equal(reread.length,1);assert.equal(reread[0].skillFile,'skill/meeting-notes/SKILL.md');
  await writeFile(join(root,'skill','meeting-notes','SKILL.md'),'# External change\n');
  assert.equal(await readDocument(context.base,draft.id,'skill/meeting-notes/SKILL.md'),'# External change\n');
  await assert.rejects(readDocument(context.base,draft.id,'../outside.md'),/Invalid workshop file path/);
  const outside=join(context.root,'outside.md');await writeFile(outside,'private');
  if(process.platform!=='win32'){
    await symlink(outside,join(root,'input','outside.md'));
    await assert.rejects(readDocument(context.base,draft.id,'input/outside.md'),/cannot be previewed/);
    await rm(join(root,'CREATION.md'));await symlink(outside,join(root,'CREATION.md'));
  }
  await command({base:context.base,home:context.home,action:'update',id:draft.id,input:{title:'已修改名称',brief:'只保留明确结论。',agent:'codex'}});
  assert.equal((await readDraft(context.base,draft.id)).title,'已修改名称');
  assert.equal((await readDraft(context.base,draft.id)).brief,userInput('codex').brief);
  assert.equal(await readFile(outside,'utf8'),'private');

  // Moving the creation default keeps each old record and installation source in place.
  const newBase=join(context.root,'new-workshop'),defaultBase=join(context.home,'.skills-space','workshop');
  const recordPath=join(root,'draft.json'),record=JSON.parse(await readFile(recordPath,'utf8'));
  record.session='retained-original-session';await writeFile(recordPath,JSON.stringify(record));
  const request={base:newBase,bases:[context.base,defaultBase],home:context.home};
  const fresh=await command({...request,action:'create',input:userInput('pi')});
  assert.equal(fresh.directory,join(newBase,'drafts',fresh.id));
  const retained=await command({...request,action:'read',id:draft.id});
  assert.equal(retained.directory,root);assert.equal(retained.skillDirectory,join(root,'skill','meeting-notes'));assert.equal(retained.session,record.session);
  assert.equal(await command({...request,action:'directory',id:draft.id,skill:true}),retained.skillDirectory);
  const revised=await command({...request,action:'update',id:draft.id,input:{title:'旧目录继续编辑',description:'不迁移原来源'}});
  assert.equal(revised.directory,root);assert.equal(revised.session,record.session);
  assert.equal((await readDraft(context.base,draft.id)).description,'不迁移原来源');
  await command({...request,action:'stop',id:draft.id});
  assert.equal(await readFile(join(root,'.stop'),'utf8'),'stop');
  await assert.rejects(stat(join(newBase,'drafts',draft.id)),{code:'ENOENT'});
  const beforeRestore=await command({...request,action:'list'});assert.equal(beforeRestore.length,2);
  await assert.rejects(stat(defaultBase),{code:'ENOENT'});
  const restored=await command({base:defaultBase,bases:[newBase,context.base],home:context.home,action:'create',input:userInput('codex')});
  assert.equal(restored.directory,join(defaultBase,'drafts',restored.id));
  const list=await command({base:defaultBase,bases:[newBase,context.base,defaultBase],home:context.home,action:'list'});
  assert.equal(new Set(list.map(item=>item.id)).size,3);assert.equal(list.length,3);
  if(process.platform!=='win32'){
    const alias=join(context.root,'workshop-alias');await symlink(context.base,alias);
    const aliased=await command({base:alias,bases:[context.base,newBase,defaultBase],home:context.home,action:'list'});
    assert.equal(aliased.length,3);assert.equal(aliased.find(item=>item.id===draft.id).directory,root);
    assert.equal(aliased.find(item=>item.id===draft.id).skillDirectory,retained.skillDirectory);
  }
  const review=join(root,'review');await mkdir(review,{recursive:true});
  await writeFile(join(review,'report.md'),'# Healthy report');
  const healthy=await command({...request,action:'detail',id:draft.id});
  assert.equal(healthy.content,'# External change\n');assert.equal(healthy.report,'# Healthy report');assert.equal(healthy.contentError,null);assert.equal(healthy.reportError,null);
  await writeFile(join(review,'report.md'),'x'.repeat(512*1024+1));
  const badReport=await command({...request,action:'detail',id:draft.id});
  assert.equal(badReport.content,healthy.content);assert.equal(badReport.contentError,null);assert(badReport.reportError);
  await writeFile(join(review,'report.md'),'# Healthy report');
  await writeFile(join(root,'skill','meeting-notes','SKILL.md'),'x'.repeat(512*1024+1));
  const badBody=await command({...request,action:'detail',id:draft.id});
  assert(badBody.contentError);assert.equal(badBody.report,'# Healthy report');assert.equal(badBody.reportError,null);
});

test('all supported Agent protocols plan read-only, confirm exact content and preserve conversation on build', {skip:process.platform==='win32'},async t=>{
  const context=await isolated(t),cli=await fakeAgents(context),oldPath=process.env.PATH;
  process.env.PATH=context.bin;t.after(()=>{process.env.PATH=oldPath;});
  for(const agent of ['codex','pi','claude-code','sarvam-code']) {
    const draft=await createDraft(context.base,userInput(agent));
    const request={base:context.base,home:context.home,cli,id:draft.id,kind:'plan',message:draft.brief};
    await command({...request,action:'validate'});
    assert.equal((await readDraft(context.base,draft.id,draft.id)).run.phase,'preparing');
    await runTurn(request);
    const planned=await readDraft(context.base,draft.id);
    assert.equal(planned.run.phase,'complete');assert.equal(planned.stage,'planned');assert.equal(planned.skillFile,null);
    const plan=await readDocument(context.base,draft.id,'PLAN.md');
    assert.equal(plan,'# 构建方案\n\n区分决定与建议。\u2028保留原日期。');
    assert.equal(planned.messages.filter(item=>item.role==='assistant').at(-1).text,plan);
    await assert.rejects(command({...request,action:'validate',kind:'build',message:'确认构建',plan:plan+'unreviewed'}),/plan changed/);
    await runTurn({...request,kind:'build',message:'确认构建',plan});
    const built=await readDraft(context.base,draft.id);
    assert.equal(built.stage,'ready');assert.equal(built.run.phase,'complete');assert.equal(built.skillFile,'skill/meeting-notes/SKILL.md');
    assert.equal(built.messages.filter(item=>item.role==='user').length,2);
    const originalSkill=await readDocument(context.base,draft.id,built.skillFile);
    await writeFile(join(draft.directory,'.test-mode'),'scope');
    await runTurn({...request,kind:'chat',message:'将输出改为 JSON，先给我新方案。'});
    const proposed=await readDraft(context.base,draft.id);
    assert.equal(proposed.stage,'planned');assert.equal(proposed.run.phase,'complete');
    assert.match(await readDocument(context.base,draft.id,'PLAN.md'),/将输出改为 JSON/);
    assert.equal(await readDocument(context.base,draft.id,built.skillFile),originalSkill);
    assert.equal((await readFile(join(draft.directory,'.creator-preparations'),'utf8')).trim(),'use');
    const calls=(await readFile(join(draft.directory,'.agent-arguments'),'utf8')).trim().split('\n').map(JSON.parse);
    if(agent==='codex'){assert(calls[0].includes('read-only'));assert(calls[1].includes('workspace-write'));assert(calls[1].includes('resume'));assert(calls[1].includes(planned.session));}
    else if(agent==='pi'){assert(calls[0].includes('read,grep,find,ls'));assert(calls[0].includes('--no-mcp'));assert.equal(calls[0][calls[0].indexOf('--session-id')+1],calls[1][calls[1].indexOf('--session-id')+1]);}
    else if(agent==='claude-code'){
      assert.equal(calls[0][calls[0].indexOf('--tools')+1],'Read,Glob,Grep');assert(calls[0].includes('--strict-mcp-config'));
      assert.equal(calls[0][calls[0].indexOf('--permission-mode')+1],'dontAsk');assert.equal(calls[1][calls[1].indexOf('--permission-mode')+1],'acceptEdits');
      assert.equal(calls[1][calls[1].indexOf('--resume')+1],planned.session);assert.equal(calls[2][calls[2].indexOf('--resume')+1],planned.session);
    }else{
      assert(calls[0].includes('app-server'));assert(calls[0].includes('sandbox_mode="read-only"'));assert(calls[1].includes('sandbox_mode="workspace-write"'));
      const rpc=(await readFile(join(draft.directory,'.sarvam-requests'),'utf8')).trim().split('\n').map(JSON.parse);
      const threads=rpc.filter(message=>['thread/start','thread/resume'].includes(message.method));
      assert.equal(threads[0].method,'thread/start');assert.equal(threads[0].params.sandbox,'read-only');
      assert.equal(threads[1].method,'thread/resume');assert.equal(threads[1].params.threadId,planned.session);assert.equal(threads[1].params.sandbox,'workspace-write');
      assert.equal(threads[2].params.threadId,planned.session);
    }
    assert.equal(proposed.session,planned.session);
  }
  const npmScript=join(context.bin,'node_modules','fake-agent','cli.js');await mkdir(join(context.bin,'node_modules','fake-agent'),{recursive:true});await writeFile(npmScript,'// command shim target');
  const shim=join(context.bin,'codex.cmd');await writeFile(shim,'@echo off\n"%_prog%" "%dp0%\\node_modules\\fake-agent\\cli.js" %*\n');
  const launch=await launcher(shim,['exec','-']);assert.equal(launch.command,process.execPath);assert.deepEqual(launch.args,[npmScript,'exec','-']);
});

test('a provider error or process exit without completion cannot become a successful plan', {skip:process.platform==='win32'},async t=>{
  const context=await isolated(t),cli=await fakeAgents(context),oldPath=process.env.PATH;
  process.env.PATH=context.bin;t.after(()=>{process.env.PATH=oldPath;});
  for(const [agent,mode] of [['codex','incomplete'],['pi','reject'],['claude-code','incomplete'],['claude-code','identity'],['sarvam-code','incomplete'],['sarvam-code','reject'],['sarvam-code','approval']]){
    const draft=await createDraft(context.base,userInput(agent));await writeFile(join(draft.directory,'.test-mode'),mode);
    await runTurn({base:context.base,home:context.home,cli,id:draft.id,kind:'plan',message:draft.brief});
    const actual=await readDraft(context.base,draft.id);
    assert.equal(actual.run.phase,'failed');assert(actual.run.error);assert.equal(actual.skillFile,null);assert(!actual.files.some(file=>file.path==='PLAN.md'));
  }
});

test('stopping an owned Agent preserves files and interrupted records are not reported as running', {skip:process.platform==='win32'},async t=>{
  const context=await isolated(t),cli=await fakeAgents(context),oldPath=process.env.PATH;
  process.env.PATH=context.bin;t.after(()=>{process.env.PATH=oldPath;});
  for(const agent of ['codex','claude-code','sarvam-code']){
    const draft=await createDraft(context.base,userInput(agent));
    const request={base:context.base,home:context.home,cli,id:draft.id,kind:'plan',message:draft.brief};
    await runTurn(request);
    const session=(await readDraft(context.base,draft.id)).session;
    await writeFile(join(draft.directory,'.test-mode'),'wait');
    await writeFile(join(draft.directory,'input','retained.md'),'Keep this material.');
    const turn=runTurn({...request,kind:'chat',message:'继续完善方案。'});
    const pid=Number(await waitFor(join(draft.directory,'.agent-started')));
    t.after(()=>{try{process.kill(-pid,'SIGKILL');}catch(e){if(e.code!=='ESRCH')throw e;}});
    assert.equal((await readDraft(context.base,draft.id,draft.id)).run.phase,'running');
    assert.equal((await readDraft(context.base,draft.id)).run.phase,'interrupted');
    await command({base:context.base,home:context.home,action:'stop',id:draft.id});
    await turn;
    const stopped=await readDraft(context.base,draft.id);
    assert.equal(stopped.run.phase,'stopped');assert.equal(stopped.run.error,null);assert.equal(stopped.session,session);
    assert.equal(await readDocument(context.base,draft.id,'input/retained.md'),'Keep this material.');
    if(agent==='sarvam-code')assert.equal(JSON.parse(await readFile(join(draft.directory,'.sarvam-interrupt'),'utf8')).threadId,session);
    await writeFile(join(draft.directory,'.test-mode'),'normal');
    await runTurn({...request,message:'恢复方案对话。'});
    const resumed=await readDraft(context.base,draft.id);assert.equal(resumed.session,session);assert.equal(resumed.stage,'planned');
  }
});


test('editing creation metadata preserves prompt, Agent, plan, conversation and generated skill files', {skip:process.platform==='win32'},async t=>{
  const context=await isolated(t),cli=await fakeAgents(context),oldPath=process.env.PATH;
  process.env.PATH=context.bin;t.after(()=>{process.env.PATH=oldPath;});
  const draft=await createDraft(context.base,{...userInput('codex'),description:'用于整理会议记录。'});
  assert.equal(draft.description,'用于整理会议记录。');
  const request={base:context.base,home:context.home,cli,id:draft.id,kind:'plan',message:draft.brief};
  await runTurn(request);
  const originalPlan=await readDocument(context.base,draft.id,'PLAN.md');
  const original=await readDraft(context.base,draft.id);
  const renamed=await command({...request,action:'update',input:{title:'新的名称',description:'新的创作描述',brief:'不得替换最初提示词',agent:'pi'}});
  assert.equal(renamed.description,'新的创作描述');assert.equal(renamed.title,'新的名称');
  assert.equal(renamed.stage,'planned');assert.equal(renamed.brief,draft.brief);assert.equal(renamed.agent,'codex');
  assert.deepEqual(renamed.messages,original.messages);
  assert.equal(await readDocument(context.base,draft.id,'CREATION.md'),draft.brief);
  assert.equal(await readDocument(context.base,draft.id,'PLAN.md'),originalPlan);
  await runTurn({...request,kind:'build',message:'按方案构建',plan:originalPlan});
  const built=await readDraft(context.base,draft.id),before=await readDocument(context.base,draft.id,built.skillFile);
  const saved=await command({...request,action:'update',input:{title:renamed.title,description:'只修改展示描述'}});
  assert.equal(saved.stage,'ready');assert.equal(saved.brief,draft.brief);assert.equal(saved.agent,'codex');
  assert.deepEqual(saved.messages,built.messages);
  assert.equal(await readDocument(context.base,draft.id,built.skillFile),before);
  assert.equal(await readDocument(context.base,draft.id,'CREATION.md'),draft.brief);

  // Read real frontmatter through the same pinned upstream parser used by details.
  const declared='---\nname: meeting-notes\ndescription: Declared metadata.\nmetadata:\n  version: "2.4.1"\nlicense: MIT\ncompatibility: Requires Node 22 or later.\n---\n# Skill content\n';
  await writeFile(join(built.skillDirectory,'SKILL.md'),declared);
  const inspector=join(context.root,'inspector');await mkdir(inspector);
  const helper=join(inspector,'inspect-skill-documents.mjs');
  await copyFile(resolve('scripts/inspect-skill-documents.mjs'),helper);
  await symlink(resolve('src-tauri/resources/upstream/skills'),join(inspector,'skills'));
  const inspected=spawnSync(process.execPath,[helper,JSON.stringify([built.skillDirectory]),'--metadata-only'],{encoding:'utf8',timeout:5000});
  assert.equal(inspected.status,0,inspected.stderr);
  const metadata=JSON.parse(inspected.stdout)[0];
  assert.equal(metadata.version,'2.4.1');assert.equal(metadata.license,'MIT');assert.equal(metadata.compatibility,'Requires Node 22 or later.');assert.equal(metadata.hash,null);assert.equal(metadata.error,null);
});


test('CLI discovery follows symlinks and skips broken or non-executable targets', {skip:process.platform==='win32'},async t=>{
  const context=await isolated(t);
  await fakeAgents(context);
  const unusable=join(context.root,'unusable');await mkdir(unusable);
  await symlink(join(context.root,'missing'),join(unusable,'codex'));
  const plain=join(unusable,'not-executable');await writeFile(plain,'no execution');await chmod(plain,0o644);
  await symlink(plain,join(unusable,'pi'));
  const agents=await agentCommands(context.home,unusable);
  assert.equal(agents.find(agent=>agent.id==='codex').path,join(context.bin,'codex'));
  assert.equal(agents.find(agent=>agent.id==='pi').path,join(context.bin,'pi'));
});


test('new creator selections follow visibility while existing conversations retain available Agents',async()=>{
  const {workshopAgentEligibility}=await import('../src/lib/workshop.ts');
  const agents=[{id:'codex',name:'Codex',available:true,path:'/test/bin/codex'},{id:'pi',name:'Pi',available:false,path:null},{id:'claude-code',name:'Claude Code',available:true,path:'/test/bin/claude'},{id:'sarvam-code',name:'Sarvam Code',available:true,path:'/test/bin/sarvam-code'}];
  assert.deepEqual(workshopAgentEligibility(agents,[],'codex'),{canContinue:true,canSelect:false});
  assert.deepEqual(workshopAgentEligibility(agents,['codex'],'codex'),{canContinue:true,canSelect:true});
  assert.deepEqual(workshopAgentEligibility(agents,['pi'],'pi'),{canContinue:false,canSelect:false});
  assert.deepEqual(workshopAgentEligibility(agents,['claude-code'],'claude-code'),{canContinue:true,canSelect:true});
  assert.deepEqual(workshopAgentEligibility(agents,[],'sarvam-code'),{canContinue:true,canSelect:false});
});
