// A real installed plugin process for isolated activation/restart evidence.
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const [home,dshHome,contextKey,cwd,name]=process.argv.slice(2);
const {inspectDsh}=await import(pathToFileURL(resolve('src-tauri/resources/upstream/inspect-dsh-skills.mjs')).href);
const snapshot=await inspectDsh(home,dshHome,cwd,{contextKey,installation:'cli'});
const selected=snapshot.presets.find(preset=>preset.key===snapshot.presetKey);
const providers=snapshot.configurations.filter(row=>selected?selected.configurationKeys.includes(row.key):row.key===snapshot.contextKey);
const anchor=providers[0].anchor,r=createRequire(anchor),load=id=>import(pathToFileURL(r.resolve(id)).href);
const [{Context},{SkillRegistry},toolSkill,llm,boot]=await Promise.all([load('@deepseek-ai/cordis'),load('@deepseek-ai/dsh-skill'),load('@deepseek-ai/dsh-tool-skill'),load('@deepseek-ai/dsh-llm'),load('@deepseek-ai/dsh-app-boot')]);
const ctx=new Context(),fibers=[];fibers.push(ctx.plugin(SkillRegistry));await fibers[0];
for(const row of providers){const dir=boot.resolveBundleDir('dsh','@skills-space/dsh-skill-policy',anchor,dirname(row.path));const plugin=await import(pathToFileURL(join(dir,'index.mjs')).href);const fiber=ctx.plugin(plugin.default,row.policyOptions);await fiber;fibers.push(fiber);}
let tool;const listeners=[],agent={session:{surface:{nodes:[]},seq:0}};
toolSkill.apply({skills:ctx.skills,tools:{register(value){tool=value;},get(){return tool;}},workingDirectory:{ensure:async()=>cwd},on(event,handler){if(event==='agent/pre-step')listeners.push(handler);}});
let model;
try{model={allowed:true,content:(await tool.execute({name},{agent,signal:new AbortController().signal})).content};}catch(error){model={allowed:false,error:error.message};}
const messages=[llm.createUserMessage({content:[{type:'text',text:`/${name}`}],source:{kind:'user'}})];let decision={kind:'continue',messages};
for(const handler of [...listeners].reverse()){const previous=decision;decision=await handler({agent,messages,signal:new AbortController().signal},async()=>previous);}
console.log(JSON.stringify({pid:process.pid,model,manual:decision.messages.filter(row=>row.source?.kind==='skill-invocation').length}));
process.stdin.resume();await new Promise(done=>process.stdin.once('end',done));for(const fiber of fibers.reverse())await fiber.dispose();
