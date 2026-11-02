import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import test from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
const {build}=createRequire(require.resolve('vite'))('esbuild');
const directory=resolve('.scratch/dialog-results-check');
mkdirSync(directory,{recursive:true});
const components={};
for(const [name,file] of Object.entries({OperationResults:'operation-results',ProjectSkillResults:'project-skill-review',RemovalReview:'removal-review',ExecutionLog:'execution-log'})){
 const output=resolve(directory,`${file}.mjs`);
 await build({entryPoints:[`src/components/${file}.tsx`],outfile:output,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',logLevel:'silent',define:{'import.meta.glob':'fixtureIconUrls'},banner:{js:'const fixtureIconUrls = () => ({});'}});
 components[name]=(await import(pathToFileURL(output).href))[name];
}
const render=(name,props)=>renderToStaticMarkup(createElement(components[name],{home:'/home/test',zh:true,busy:false,...props}));
const removal=(path,outcome,selected=true)=>({path,outcome,selected,agents:['pi']});
const item=(skill,status,paths)=>({skill,status,message:'Review required',removal:{paths,unrelatedPreserved:true,lock:'removed'}});
const result=items=>({items,inventory:{skills:[]},logs:''});

test('successful removal shows completion without obsolete paths or empty log',()=>{
 const html=render('OperationResults',{operation:{action:'remove'},result:result([item('gone','complete',[removal('/home/test/gone','removed')])])});
 assert.match(html,/已卸载 1 个技能/);
 assert.ok(!html.includes('查看路径')&&!html.includes('执行日志')&&!html.includes('/gone'));
});
test('mixed removal shows only actionable incomplete paths',()=>{
 const html=render('OperationResults',{operation:{action:'remove'},result:result([item('gone','complete',[removal('/home/test/gone','removed')]),item('partial','uncertain',[removal('/home/test/already-removed','removed'),removal('/home/test/still-here','retained'),removal('/home/test/unselected-copy','retained',false)])])});
 assert.match(html,/still-here/);
 assert.ok(!html.includes('/gone')&&!html.includes('already-removed')&&!html.includes('unselected-copy'));
 assert.match(html,/未完成/);
});
test('dependency and restore results retain exception paths without success records',()=>{
 for(const kind of ['dependency','restore']){
 const html=render('ProjectSkillResults',{kind,agents:[],result:{items:[{skill:'gone',path:'/home/test/gone',status:'complete',action:'remove'},{skill:'broken',path:'/home/test/broken',status:'failed',action:'install',contentMatches:false}],warnings:[],logs:''}});
 assert.ok(!html.includes('/gone'));
 assert.match(html,/broken/);
 assert.match(html,/查看路径/);
 }
 const complete=render('ProjectSkillResults',{kind:'dependency',agents:[],result:{items:[{skill:'gone',path:'/home/test/gone',status:'complete',action:'remove'}],warnings:[],logs:''}});
 assert.ok(!complete.includes('查看路径')&&!complete.includes('执行日志'));
});
test('single uninstall keeps complete paths and impact without redundant scope or disclosure',()=>{
 const html=render('RemovalReview',{operation:{skills:['browser'],target:{scope:'global'},agents:['pi'],removals:[{shared:true,agents:['pi'],cleanupPossible:false,paths:[{path:'/home/test/.agents/skills/browser',selected:true,agents:['pi'],kind:'copy'}]}]},agents:[{id:'pi',name:'Pi',installationStatus:'confirmed'}],onIncludeCopies:()=>{}});
 assert.match(html,/~\/.agents\/skills\/browser/);
 assert.match(html,/Pi/);
 assert.ok(!html.includes('查看路径')&&!html.includes('全局')&&!html.includes('影响 Agent'));
 assert.equal(render('ExecutionLog',{value:'  '}),'');
});

test('associated-copy failures retain local-edit guidance and never offer CLI reinstall',()=>{
 const result={items:[{skill:'fixture-skill',status:'failed',message:'Local changes detected; synced copy was retained.',removal:null,evePaths:null}],inventory:{version:'1.7.2',agents:[],warnings:[],skills:[{name:'fixture-skill',path:'/copy',agents:['claude-code'],source:'/source',sourceUrl:null,installSource:'/source',sourceType:'local-sync',description:''}]},logs:''};
 const html=renderToStaticMarkup(createElement(components.OperationResults,{result,operation:{action:'update'},home:'/fixture',zh:true,busy:false,onReinstall:()=>{}}));
 assert(!html.includes('重新安装'));assert(!html.includes('状态尚未确认'));assert(html.includes('关联副本已修改，已保留'));
});

test('successful source update and retained associated copy are reported separately',()=>{
 const html=render('OperationResults',{operation:{action:'update'},result:{items:[{skill:'demo',status:'complete',message:'',removal:null,evePaths:null},{skill:'demo',status:'failed',message:'Local changes detected; synced copy was retained.',removal:null,evePaths:null}],inventory:{skills:[]},logs:''}});
 assert.match(html,/已更新 1 个技能/);assert.match(html,/1 个关联副本未完成/);assert.match(html,/demo · 关联副本/);assert(!html.includes('已阻止更新'));
});


test('same-name associated failures retain each Agent and destination',()=>{
 const failures=['claude-code','windsurf'].map(agent=>({skill:'demo',status:'failed',message:'Local changes detected; synced copy was retained.',destination:`/home/test/${agent}/demo`,agents:[agent]}));
 const html=render('OperationResults',{operation:{action:'update'},result:{items:[{skill:'demo',status:'complete',message:''},...failures],inventory:{skills:[],agents:[{id:'claude-code',name:'Claude Code'},{id:'windsurf',name:'Windsurf'}]},logs:''}});
 assert.match(html,/2 个关联副本未完成/);assert.match(html,/Claude Code/);assert.match(html,/Windsurf/);assert.match(html,/~\/claude-code\/demo/);assert.match(html,/~\/windsurf\/demo/);assert(!html.includes('重新安装'));
});

test('result rows distinguish missing files, changed content and unreadable records',()=>{
 const cases=[
  {skill:'missing',contentMatches:false,contentState:'missing',lockMatches:true},
  {skill:'changed',contentMatches:false,contentState:'different',lockMatches:true},
  {skill:'unreadable',contentMatches:true,contentState:'matching',lockMatches:false,lockState:'unreadable'},
 ];
 const html=render('ProjectSkillResults',{kind:'restore',agents:[],result:{items:cases.map(item=>({...item,path:`/home/test/${item.skill}`,status:'failed',afterKind:'directory'})),warnings:[],logs:''}});
 assert.match(html,/目标文件未安装/);assert.match(html,/目标内容与安装来源不一致/);assert.match(html,/无法读取安装记录/);
 assert.ok(!html.includes('内容缺失、不符或无法核对')&&!html.includes('来源记录需核对'));
});
test('uninstall uncertainty never claims that unrelated skills were changed',()=>{
 const html=render('OperationResults',{operation:{action:'remove'},result:result([{skill:'demo',status:'uncertain',message:'unverified',removal:{paths:[],lock:'removed',unrelatedPreserved:false}}])});
 assert.match(html,/未能确认其他技能是否保持原样/);assert.ok(!html.includes('其他技能发生变化'));
});
