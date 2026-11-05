import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, chmod, copyFile, stat, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { contentHash } from './workshop-builtins.mjs';
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
  await writeFile(cli, `import {appendFileSync} from 'node:fs';import {join} from 'node:path';
const dir=process.argv[3],name=process.argv[5];
appendFileSync(join(process.cwd(),'.creator-preparations'),'use\\n');
process.stdout.write('Selected skill: '+name+'\\nSupporting files for this skill were downloaded to:\\n'+dir+'\\n');`);
  const body = '#!'+process.execPath+'\n'+String.raw`
const fs=require('node:fs'),path=require('node:path');
const args=process.argv.slice(2),name=path.basename(process.argv[1]),pi=name==='pi',claude=name==='claude',sarvam=name==='sarvam-code';
const session='00000000-0000-4000-8000-000000000001';
const mode=fs.existsSync('.test-mode')?fs.readFileSync('.test-mode','utf8'):'normal';
let hold,threadId=session,turnId='turn-1',threadPolicy;
const appServer=name==='codex'&&args.includes('app-server');
fs.appendFileSync('.agent-arguments',JSON.stringify(args)+'\n');
const emit=value=>process.stdout.write(JSON.stringify(value)+'\r\n');
function identity(){if(claude){if(mode!=='identity')emit({type:'system',subtype:'init',session_id:session});}else if(!pi)emit({type:'thread.started',thread_id:session});}
function wait(){process.on('SIGTERM',()=>{});fs.writeFileSync('.agent-started',String(process.pid));hold=setInterval(()=>{},1000);}
function content(planning,instruction=''){
if(path.basename(path.dirname(process.cwd()))==='.evaluations'){
 const rules=fs.readFileSync('.skills-space/INSTRUCTIONS.md','utf8'),skill=fs.readFileSync('skill/SKILL.md','utf8'),reference=fs.readFileSync('skill/references/template.md','utf8');
 const root=path.dirname(path.dirname(process.cwd()));
 fs.appendFileSync(path.join(root,'.evaluation-reads'),JSON.stringify({name,args,instruction,rules,skill,reference,threadPolicy})+'\n');
 if(/Do not (?:write files or )?run commands/i.test(instruction))return 'Unable to read files: all commands are prohibited.';
 const evidence=skill.includes('# Meeting notes')&&reference.includes('# Template')?'SKILL.md and references/template.md read':'Source content was not read';
 const report={schemaVersion:1,summary:evidence,structure:[{id:'metadata',score:8,max:10,evidence},{id:'instructions',score:15,max:20,evidence},{id:'portability',score:14,max:15,evidence},{id:'resources',score:13,max:15,evidence}],actual:null,issues:[]};
 return '# Evaluation\n\n'+String.fromCharCode(96).repeat(3)+'json\n'+JSON.stringify(report)+'\n'+String.fromCharCode(96).repeat(3);
}
if(!planning&&mode!=='scope'){fs.mkdirSync('skill/meeting-notes/references',{recursive:true});fs.writeFileSync('skill/meeting-notes/SKILL.md','---\nname: meeting-notes\ndescription: Meeting notes.\n---\n# Meeting notes\n');fs.writeFileSync('skill/meeting-notes/references/template.md','# Template\n');}
return mode==='scope'?'# 修改方案\n\n将输出改为 JSON。\n<!-- skills-space:scope-change -->':planning?'# 构建方案\n\n区分决定与建议。\u2028保留原日期。\n<!-- skills-space:plan-ready -->':'已生成 skill/meeting-notes/SKILL.md。';
}
function respond(instruction=''){
identity();
if(mode==='wait'){wait();return;}
if(mode==='reject'){emit(pi?{type:'response',command:'prompt',success:false,error:'Provider unavailable'}:claude?{type:'result',subtype:'error_during_execution',is_error:true,session_id:session,errors:['Provider unavailable']}:{type:'turn.failed',error:{message:'Provider unavailable'}});return;}
const planning=args.includes('read-only')||args.includes('read,grep,find,ls')||claude&&args.includes('Read,Glob,Grep');
const text=content(planning,instruction);
if(pi){if(!args.includes('--no-extensions'))emit({type:'extension_ui_request',id:'status',method:'setStatus',statusKey:'test',statusText:'Working'});emit({type:'response',command:'prompt',success:true,data:{disposition:'started'}});emit({type:'message_update',assistantMessageEvent:{type:'text_delta',delta:'尚未完成的片段'}});emit({type:'message_end',message:{role:'assistant',stopReason:'stop',content:[{type:'text',text}]}});if(mode!=='incomplete')emit({type:'agent_settled',aborted:false});}
else if(claude){emit({type:'stream_event',parent_tool_use_id:null,event:{type:'content_block_delta',delta:{type:'text_delta',text:'尚未完成的片段'}}});emit({type:'assistant',parent_tool_use_id:'other-agent',message:{content:[{type:'text',text:'不得覆盖主会话'}]}});emit({type:'assistant',parent_tool_use_id:null,message:{content:[{type:'text',text}]}});if(mode!=='incomplete')emit({type:'result',subtype:'success',is_error:false,...(mode==='identity'?{}:{session_id:session}),result:text});}
else{emit({type:'item.completed',item:{type:'agent_message',text}});if(mode!=='incomplete')emit({type:'turn.completed'});}
if(mode==='incomplete')process.exit(0);
}
function rpc(message){
fs.appendFileSync('.sarvam-requests',JSON.stringify(message)+'\n');
if(message.method==='initialize'){emit(mode==='reject'?{id:message.id,error:{code:-32000,message:'Provider unavailable'}}:{id:message.id,result:{userAgent:'original-sarvam-simulation'}});}
else if(message.method==='thread/start'||message.method==='thread/resume'){threadPolicy=message.params;threadId=message.params.threadId||session;emit({id:message.id,result:{thread:{id:threadId},model:'fixture-model'}});}
else if(message.method==='turn/start'){
 emit({id:message.id,result:{turn:{id:turnId}}});emit({method:'turn/started',params:{threadId,turn:{id:turnId}}});
 if(mode==='wait'){wait();return;}
 if(mode==='approval'){emit({id:99,method:'item/fileChange/requestApproval',params:{threadId,turnId}});return;}
 if(appServer&&message.params.collaborationMode.mode==='default'){
  if(mode!=='no-change'&&threadPolicy.sandbox==='workspace-write')content(false);
  emit({method:'item/completed',params:{threadId,turnId,item:{type:'agentMessage',text:'Approved plan complete.'}}});
  emit({method:'turn/completed',params:{threadId,turn:{id:turnId,status:'completed'}}});
  return;
 }
 if(appServer){
  fs.writeFileSync('.agent-started',String(process.pid));
  emit({id:99,method:'item/tool/requestUserInput',params:{threadId,turnId,isBlocking:true,questions:[{id:'capitalization',question:'Which capitalization?',options:[{label:'Title case',description:'Capitalize every word'}]}]}});
  return;
 }

 const planning=args.some(arg=>arg.includes('read-only')),text=content(planning,message.params.input.map(item=>item.text||'').join('\n'));
 emit({method:'item/agentMessage/delta',params:{threadId:'foreign-thread',turnId,delta:'不得进入主对话'}});
 emit({method:'item/agentMessage/delta',params:{threadId,turnId,delta:'尚未完成的片段'}});
 emit({method:'item/completed',params:{threadId,turnId,item:{type:'agentMessage',text}}});
 emit({method:'turn/completed',params:{threadId,turn:{id:'foreign-turn',status:'completed'}}});
 if(mode==='incomplete')process.exit(0);
 emit({method:'turn/completed',params:{threadId,turn:{id:turnId,status:'completed'}}});
}else if(appServer&&message.id===99&&!message.method){
 const answer=message.result.answers.capitalization.answers[0];
 emit({method:'serverRequest/resolved',params:{threadId,requestId:99}});
 emit({method:'item/completed',params:{threadId,turnId,item:{id:'progress',type:'agentMessage',text:'Checking the title examples.'}}});
 emit({method:'item/completed',params:{threadId,turnId,item:{id:'marker',type:'agentMessage',text:'<!-- skills-space:plan-ready -->'}}});
 emit({method:'item/completed',params:{threadId,turnId,item:{id:'plan-1',type:'plan',text:'# Confirmed plan\n\n'+answer}}});
 emit({method:'turn/completed',params:{threadId,turn:{id:turnId,status:'completed'}}});
}else if(message.method==='turn/interrupt'){
 fs.writeFileSync('.sarvam-interrupt',JSON.stringify(message.params));emit({id:message.id,result:{}});emit({method:'turn/completed',params:{threadId,turn:{id:turnId,status:'interrupted'}}});
}
}
if(pi||sarvam||appServer){let input='';process.stdin.on('data',chunk=>{input+=chunk;let split;while((split=input.indexOf('\n'))>=0){const line=input.slice(0,split);input=input.slice(split+1);if(line.trim())(sarvam||appServer)?rpc(JSON.parse(line)):respond(JSON.parse(line).message);}});process.stdin.on('end',()=>clearInterval(hold));}
else{let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>input+=chunk);process.stdin.on('end',()=>respond(input));}
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


test('Codex native planning answers the active request, expires it on stop and switches mode for approved writes', {skip:process.platform==='win32',timeout:20000},async t=>{
  const context=await isolated(t),cli=await fakeAgents(context),draft=await createDraft(context.base,userInput('codex'));
  const oldPath=process.env.PATH;
  process.env.PATH=context.bin;t.after(()=>{process.env.PATH=oldPath;});
  const request={base:context.base,home:context.home,cli,id:draft.id,activeId:draft.id,nativeQuestions:true,kind:'plan',message:draft.brief};
  async function waitForQuestion(){
    for(let i=0;i<100;i++){
      const {run}=await readDraft(context.base,draft.id,draft.id);
      if(run?.question)return run;
      if(run?.phase==='failed')throw new Error(run.error);
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    throw new Error('Native Codex question did not appear.');
  }
  const running=runTurn(request);
  const first=await waitForQuestion();
  assert.equal(first.question.questions[0].question,'Which capitalization?');
  const response={...request,action:'answer',runId:first.id,token:first.question.token,answers:{capitalization:'Title case'}};
  await assert.rejects(command({...response,runId:'unrelated-run'}),/no longer active/);
  await command(response);
  await running;
  const planned=await readDraft(context.base,draft.id);
  assert.equal(planned.stage,'planned');
  assert.equal(planned.run.question,undefined);
  assert.deepEqual(planned.messages.find(message=>message.plan)?.updates,['Checking the title examples.']);
  const answer=planned.messages.find(message=>message.role==='user'&&message.question);
  assert.equal(answer.question,'Which capitalization?');
  assert.equal(answer.text,'Title case');
  assert.equal(await readDocument(context.base,draft.id,'PLAN.md'),'# Confirmed plan\n\nTitle case');
  assert.equal(planned.skillFile,null);
  const protocol=(await readFile(join(draft.directory,'.sarvam-requests'),'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(protocol.find(message=>message.method==='thread/start').params.sandbox,'read-only');
  assert.equal(protocol.find(message=>message.method==='turn/start').params.collaborationMode.mode,'plan');
  assert.equal(protocol.filter(message=>message.method==='turn/start').length,1);
  assert.deepEqual(protocol.find(message=>message.id===99).result,{answers:{capitalization:{answers:['Title case']}}});

  const next=runTurn({...request,kind:'chat',message:'Use another capitalization.'});
  const second=await waitForQuestion();
  await assert.rejects(command(response),/no longer active/);
  await command({...request,action:'stop'});
  await next;
  const stopped=await readDraft(context.base,draft.id);
  assert.equal(stopped.run.phase,'stopped');
  assert.equal(stopped.run.question,undefined);
  await assert.rejects(command({...response,runId:second.id,token:second.question.token}),/no longer active/);
  await assert.rejects(command({...request,action:'validate',kind:'build',plan:'# Confirmed plan\n\nTitle case'}),/plan changed/i);

  const revision=runTurn({...request,kind:'chat',message:'Revise and then submit for approval.'});
  const current=await waitForQuestion();
  await command({...response,runId:current.id,token:current.question.token});
  await revision;
  const build={...request,kind:'build',message:'Implement the plan.',plan:await readDocument(context.base,draft.id,'PLAN.md')};
  await writeFile(join(draft.directory,'.test-mode'),'no-change');
  await runTurn(build);
  const noChange=await readDraft(context.base,draft.id);
  assert.equal(noChange.stage,'planned');
  assert.equal(noChange.run.phase,'failed');
  assert.match(noChange.run.error,/did not produce any skill changes/);
  assert.equal(noChange.skillFile,null);

  await rm(join(draft.directory,'.test-mode'));
  await runTurn(build);
  const built=await readDraft(context.base,draft.id);
  assert.equal(built.stage,'ready');
  assert.equal(built.run.phase,'complete');
  assert.match(await readDocument(context.base,draft.id,'skill/meeting-notes/SKILL.md'),/# Meeting notes/);
  const calls=(await readFile(join(draft.directory,'.sarvam-requests'),'utf8')).trim().split('\n').map(JSON.parse);
  const resumed=calls.filter(message=>message.method==='thread/resume').at(-1).params;
  assert.equal(resumed.threadId,planned.session);
  assert.equal(resumed.sandbox,'workspace-write');
  assert.equal(calls.filter(message=>message.method==='turn/start').at(-1).params.collaborationMode.mode,'default');

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


// One complete role transition protects source ownership, session routing and report recovery.
test('creation optimization and evaluation retain separate sessions, pinned resources and read-only reports', {skip:process.platform==='win32'},async t=>{
  const context=await isolated(t),cli=await fakeAgents(context),oldPath=process.env.PATH;
  process.env.PATH=context.bin;t.after(()=>{process.env.PATH=oldPath;});
  const agent='#!'+process.execPath+'\n'+String.raw`
const fs=require('node:fs'),path=require('node:path');
const args=process.argv.slice(2),cwd=process.cwd(),evaluating=path.basename(path.dirname(cwd))==='.evaluations';
const root=evaluating?path.dirname(path.dirname(cwd)):cwd;
let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>input+=chunk);process.stdin.on('end',()=>{
const resource=fs.readFileSync(path.join(cwd,'.skills-space/INSTRUCTIONS.md'),'utf8');
const role=evaluating?'evaluator':resource.includes('skill-optimizer')?'optimizer':'creator';
const mode=fs.existsSync(path.join(root,'.assessment-mode'))?fs.readFileSync(path.join(root,'.assessment-mode'),'utf8'):'normal';
const session=role==='creator'?'creator-original-session':role==='optimizer'?'optimizer-separate-session':'evaluation-'+path.basename(cwd);
fs.appendFileSync(path.join(root,'.assessment-calls'),JSON.stringify({args,cwd,input,role,session})+'\n');
const emit=value=>process.stdout.write(JSON.stringify(value)+'\n');emit({type:'thread.started',thread_id:session});
if(evaluating){
if(mode==='fail'){emit({type:'item.completed',item:{type:'agent_message',text:'# Partial failed review'}});emit({type:'turn.failed',error:{message:'Evaluation provider unavailable'}});return;}
if(mode==='wait'){emit({type:'item.completed',item:{type:'agent_message',text:'# Partial stopped review'}});fs.writeFileSync(path.join(root,'.evaluation-started'),String(process.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},1000);return;}
if(mode==='mutate'){fs.appendFileSync('skill/SKILL.md','\nUnauthorized snapshot edit');}
const report={schemaVersion:1,summary:'Useful but the output contract needs clarification.',structure:[{id:'metadata',score:8,max:10,evidence:'SKILL.md: description'},{id:'instructions',score:15,max:20,evidence:'SKILL.md: workflow'},{id:'portability',score:14,max:15,evidence:'SKILL.md: relative resources'},{id:'resources',score:13,max:15,evidence:'references/template.md: template'}],actual:mode==='false-score'||input.includes('Actual output supplied by the user: Observed ')?{score:40,max:40,checks:[{expectation:'Correct',result:'pass',evidence:'Invented output'}]}:null,issues:[{title:'Clarify output',impact:'Output is ambiguous.',path:'SKILL.md',evidence:'# Meeting notes',suggestion:'Specify an output example.'}]};
const text=mode==='malformed'?'# Review without required JSON':'# Review\n\nEvidence-based findings.\n\n'+String.fromCharCode(96).repeat(3)+'json\n'+JSON.stringify(report)+'\n'+String.fromCharCode(96).repeat(3);
emit({type:'item.completed',item:{type:'agent_message',text}});
}else{
const planning=args.includes('read-only');if(!planning){fs.mkdirSync('skill/meeting-notes/references',{recursive:true});fs.writeFileSync('skill/meeting-notes/SKILL.md','---\nname: meeting-notes\ndescription: Meeting notes.\n---\n# Meeting notes\n');fs.writeFileSync('skill/meeting-notes/references/template.md','# Template\n');}
if(!planning&&role==='optimizer'&&JSON.parse(fs.readFileSync('draft.json','utf8')).optimizationParent)fs.appendFileSync('skill/meeting-notes/SKILL.md',args.join(' ')+'\\n'+input.slice(-60)+'\\n');
const text=input.endsWith('Ask for a template choice.')?'Which template?':planning?'# Plan '+role+'\n\nKeep one portable skill.\n<!-- skills-space:plan-ready -->':'Completed '+role;
emit({type:'item.completed',item:{type:'agent_message',text}});
}emit({type:'turn.completed'});
});`;
  await writeFile(join(context.bin,'codex'),agent);await chmod(join(context.bin,'codex'),0o755);
  const draft=await createDraft(context.base,userInput('codex'));
  const request={base:context.base,home:context.home,cli,id:draft.id,message:'Create the skill',kind:'plan'};
  await runTurn(request);
  const original=(await readDraft(context.base,draft.id)),creatorPin=original.resourcePins['creator:codex'];
  await runTurn({...request,kind:'build',plan:await readDocument(context.base,draft.id,'PLAN.md')});
  const ready=await readDraft(context.base,draft.id),source=ready.skillDirectory,sourceHash=await contentHash(source),creatorSession=ready.session;
  await runTurn({...request,kind:'chat',skill:'optimizer',message:'Ask for a template choice.'});
  const clarification=await readDraft(context.base,draft.id);
  assert.equal(clarification.messages.at(-1).text,'Which template?');
  await runTurn({...request,kind:'chat',message:'Use a prompt template.'});
  const optimizedPlan=await readDraft(context.base,draft.id);
  assert.equal(optimizedPlan.pendingSkill,'optimizer');assert.equal(optimizedPlan.session,creatorSession);
  assert.notEqual(optimizedPlan.sessions['optimizer:codex'],creatorSession);
  assert.equal(await contentHash(source),sourceHash);
  await runTurn({...request,kind:'build',skill:'optimizer',plan:await readDocument(context.base,draft.id,'PLAN.md')});
  const optimized=await readDraft(context.base,draft.id);
  assert.equal(optimized.stage,'ready');assert.equal(optimized.session,creatorSession);assert.deepEqual(optimized.resourcePins['creator:codex'],creatorPin);
  const optimizedHash=await contentHash(source);
  const evaluation={...request,kind:'chat',skill:'evaluator',message:'Review without running the task.'};
  await runTurn(evaluation);
  let state=await readDraft(context.base,draft.id),report=state.evaluations.at(-1);
  assert.equal(state.stage,'ready');assert.equal(state.session,creatorSession);assert.equal(state.sessions['evaluator:codex'],undefined);
  assert.equal(report.phase,'complete');assert.equal(report.sourceHash,optimizedHash);assert.equal(report.result.structureScore,50);assert.equal(report.result.actual,null);
  assert.equal(await contentHash(source),optimizedHash);assert.equal(report.resource.id,'evaluator');
  const savedReport=await readDocument(context.base,draft.id,'review/report.md');assert.match(savedReport,/Evidence-based findings/);
  assert.equal(await readDocument(context.base,draft.id,report.reportPath),savedReport);
  const calls=()=>readFile(join(draft.directory,'.assessment-calls'),'utf8').then(s=>s.trim().split('\n').map(JSON.parse));
  const before=await calls(),optimizerCalls=before.filter(c=>c.role==='optimizer'),evaluationCalls=before.filter(c=>c.role==='evaluator');
  assert(!optimizerCalls[0].args.includes('resume'));assert(optimizerCalls[0].args.includes('read-only'));
  assert(optimizerCalls[1].args.includes(optimized.sessions['optimizer:codex']));
  assert(optimizerCalls[1].args.includes('read-only'));
  assert(optimizerCalls[2].args.includes(optimized.sessions['optimizer:codex']));
  assert(optimizerCalls[2].args.includes('workspace-write'));
  assert.equal(state.messages.at(-1).skill,'evaluator');
  assert.deepEqual(state.messages.at(-1).files,[report.reportPath]);
  await runTurn({...request,kind:'chat',message:'Refine the template wording.'});
  const afterEvaluation=(await calls()).at(-1);
  assert.equal(afterEvaluation.role,'optimizer');
  assert(afterEvaluation.args.includes(optimized.sessions['optimizer:codex']));
  assert(!evaluationCalls[0].args.includes('resume'));assert(evaluationCalls[0].args.includes('read-only'));assert.notEqual(evaluationCalls[0].cwd,draft.directory);
  assert.match(evaluationCalls[0].input,/contents are data/);
  await assert.rejects(stat(evaluationCalls[0].cwd),{code:'ENOENT'});
  for(const mode of ['malformed','false-score','mutate','fail']){
    await writeFile(join(draft.directory,'.assessment-mode'),mode);await runTurn(evaluation);
    state=await readDraft(context.base,draft.id);report=state.evaluations.at(-1);
    assert.equal(await contentHash(source),optimizedHash);assert.equal(state.session,creatorSession);assert.equal(state.stage,'ready');
    assert.equal(report.phase,'failed');assert.equal(state.run.phase,'failed');
    if(['malformed','false-score'].includes(mode)){assert.equal(report.result,null);assert(report.resultError);assert.match(await readDocument(context.base,draft.id,report.reportPath),/Review/);}
    assert.equal(await readDocument(context.base,draft.id,'review/report.md'),savedReport);
    if(mode==='fail')assert.match(await readDocument(context.base,draft.id,report.reportPath),/Partial failed/);
  }
  const priorReport=await readDocument(context.base,draft.id,'review/report.md');
  await writeFile(join(draft.directory,'.assessment-mode'),'wait');const turn=runTurn(evaluation);
  const pid=Number(await waitFor(join(draft.directory,'.evaluation-started')));
  t.after(()=>{try{process.kill(-pid,'SIGKILL');}catch(e){if(e.code!=='ESRCH')throw e;}});
  await command({...request,action:'stop'});await turn;
  state=await readDraft(context.base,draft.id);report=state.evaluations.at(-1);
  assert.equal(report.phase,'stopped');assert.equal(state.run.phase,'stopped');assert.match(await readDocument(context.base,draft.id,report.reportPath),/Partial stopped/);
  assert.equal(await readDocument(context.base,draft.id,'review/report.md'),priorReport);assert.equal(await contentHash(source),optimizedHash);
  await writeFile(join(draft.directory,'.assessment-mode'),'normal');
  await runTurn({...request,kind:'chat',skill:'creator',message:'Make a small refinement.'});
  const last=(await calls()).at(-1);assert(last.args.includes(creatorSession));assert.equal(last.role,'creator');
  await runTurn({...request,kind:'chat',message:'Continue that refinement.'});
  const creatorFollowup=(await calls()).at(-1);
  assert.equal(creatorFollowup.role,'creator');assert(creatorFollowup.args.includes(creatorSession));
  const persisted=await command({...request,action:'detail'});assert.equal(persisted.evaluations.length,6);assert.equal(persisted.currentSourceHash,optimizedHash);
  const firstId=await command({...request,action:'optimization-start'});
  const first=await readDraft(context.base,firstId);
  assert.equal(first.optimizationParent,draft.id);
  assert.equal(await contentHash(first.skillDirectory),optimizedHash);
  const staged={...request,id:firstId,action:'run',skill:'optimizer'};
  await command({...staged,kind:'chat',message:'Add a template.'});
  const firstPlan=await readDocument(context.base,firstId,'PLAN.md');
  await command({...staged,kind:'build',plan:firstPlan});
  const reviewed=await readDraft(context.base,firstId);
  assert.equal(reviewed.run.phase,'complete');
  assert.deepEqual(reviewed.changedFiles,[{path:'SKILL.md',kind:'modified'}]);
  assert(reviewed.evaluations.some(report=>report.sourceHash===reviewed.candidateHash&&report.result));
  assert(reviewed.evaluations.some(report=>report.sourceHash===optimizedHash&&report.result));
  assert.equal(await contentHash(source),optimizedHash);
  await command({...staged,skill:'evaluator',kind:'chat',task:'Same test',baselineOutput:'Observed baseline',output:'Observed candidate'});
  const paired=(await readDraft(context.base,firstId)).evaluations.filter(report=>report.comparisonId);
  assert.equal(paired.length,2);
  assert.equal(paired[0].comparisonId,paired[1].comparisonId);
  assert.deepEqual(paired.map(report=>report.sourceHash),[optimizedHash,reviewed.candidateHash]);
  assert(paired.every(report=>report.result?.actual));
  const secondId=await command({...request,action:'optimization-start'});
  const second=await readDraft(context.base,secondId);
  assert.equal(await contentHash(second.skillDirectory),reviewed.candidateHash);
  await assert.rejects(command({...request,id:firstId,action:'validate',skill:'optimizer'}),/closed/);
  const secondTurn={...staged,id:secondId};
  await command({...secondTurn,kind:'chat',message:'Refine the template.'});
  await command({...secondTurn,kind:'build',plan:await readDocument(context.base,secondId,'PLAN.md')});
  const finalCandidate=await readDraft(context.base,secondId);
  const apply={...request,action:'optimization-apply',roundId:secondId,candidateHash:finalCandidate.candidateHash};
  const originalFile=join(source,'SKILL.md'), originalText=await readFile(originalFile,'utf8');
  await writeFile(originalFile,originalText+'\nExternal edit\n');
  await assert.rejects(command(apply),/changed/);
  await writeFile(originalFile,originalText);
  await command(apply);
  assert.equal(await contentHash(source),finalCandidate.candidateHash);
  assert.equal((await readDraft(context.base,draft.id)).optimization.appliedRound,secondId);
  const reopened=await command({...request,action:'optimization-open'});
  assert.notEqual(reopened,secondId);
  assert.equal(await command({...request,action:'optimization-open'}),reopened);
  const restarted=await readDraft(context.base,draft.id);
  assert.equal(restarted.optimization.baselineHash,finalCandidate.candidateHash);
  assert.deepEqual(restarted.optimization.history.map(round=>round.id),[firstId,secondId]);
  assert.equal(await contentHash((await readDraft(context.base,reopened)).skillDirectory),finalCandidate.candidateHash);

  const legacy=await createDraft(context.base,userInput('codex')),legacyPath=join(legacy.directory,'draft.json');
  const legacyRecord=JSON.parse(await readFile(legacyPath,'utf8'));legacyRecord.session='legacy-original-session';await writeFile(legacyPath,JSON.stringify(legacyRecord));
  await runTurn({...request,id:legacy.id});const legacyState=await readDraft(context.base,legacy.id);
  assert.equal(legacyState.run.phase,'complete');const legacyCall=JSON.parse((await readFile(join(legacy.directory,'.assessment-calls'),'utf8')).trim());
  assert(legacyCall.args.includes('legacy-original-session'));assert(legacyState.resourcePins['creator:codex']);
});


// One shared source is reviewed by four original protocol adapters without changing its creator.
test('evaluation Agent selection permits read-only reads and preserves the creation session', {skip:process.platform==='win32',timeout:15000},async t=>{
  const context=await isolated(t),cli=await fakeAgents(context),oldPath=process.env.PATH;
  process.env.PATH=context.bin;t.after(()=>{process.env.PATH=oldPath;});
  const draft=await createDraft(context.base,userInput('codex'));
  const request={base:context.base,home:context.home,cli,id:draft.id,message:'Create the skill',kind:'plan'};
  await runTurn(request);
  await runTurn({...request,kind:'build',plan:await readDocument(context.base,draft.id,'PLAN.md')});
  const ready=await readDraft(context.base,draft.id),sourceHash=await contentHash(ready.skillDirectory),session=ready.session;
  for(const agent of ['codex','pi','claude-code','sarvam-code']){
    await runTurn({...request,kind:'chat',skill:'evaluator',agent,message:'Review the skill and referenced resources without changing them.'});
    const state=await readDraft(context.base,draft.id),report=state.evaluations.at(-1);
    assert.equal(state.run.phase,'complete',state.run.error);assert.equal(report.phase,'complete');assert.equal(report.agent,agent);
    assert.equal(report.result.summary,'SKILL.md and references/template.md read');assert.equal(report.result.actual,null);
    assert.equal(state.agent,'codex');assert.equal(state.session,session);assert.deepEqual(state.sessions,ready.sessions);
    assert.equal(await contentHash(ready.skillDirectory),sourceHash);assert.equal(state.stage,'ready');
    const call=JSON.parse((await readFile(join(draft.directory,'.evaluation-reads'),'utf8')).trim().split('\n').at(-1));
    assert.match(call.rules,/skill-evaluator/);assert.match(call.skill,/# Meeting notes/);assert.match(call.reference,/# Template/);
    assert(!call.args.includes('--resume')&&!call.args.includes('resume'));
    if(agent==='codex'){assert.equal(call.args[call.args.indexOf('--sandbox')+1],'read-only');assert.match(call.instruction,/read-only sandbox/);}
    if(agent==='pi'){assert.equal(call.args[call.args.indexOf('--tools')+1],'read,grep,find,ls');assert(call.args.includes('--no-extensions'));assert.match(call.instruction,/read, grep, find and ls tools/);}
    if(agent==='claude-code'){assert.equal(call.args[call.args.indexOf('--tools')+1],'Read,Glob,Grep');assert.equal(call.args[call.args.indexOf('--allowedTools')+1],'Read,Glob,Grep');assert.match(call.instruction,/Read, Glob and Grep tools/);}
    if(agent==='sarvam-code'){
      assert(call.args.includes('sandbox_mode="read-only"'));
      assert.equal(call.threadPolicy.sandbox,'read-only');assert.equal(call.threadPolicy.approvalPolicy,'never');assert.match(call.instruction,/read-only sandbox/);
    }
    assert.match(await readDocument(context.base,draft.id,report.reportPath),/# Evaluation/);
  }
  const persisted=await command({...request,action:'detail'});assert.equal(persisted.evaluations.length,4);assert.equal(persisted.currentSourceHash,sourceHash);
});
