// Read-only Hermes configuration and inventory. Never import Hermes or execute skill code.
import {readFileSync,statSync,lstatSync,realpathSync,readdirSync,existsSync} from 'node:fs';
import {resolve,join,dirname,basename,relative,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parseDocument} from './skills/node_modules/yaml/dist/index.js';
const actual=p=>{try{return realpathSync(p);}catch{return resolve(p);}};
const hash=s=>createHash('sha256').update(s).digest('hex');
const excluded=new Set(['.git','.github','.hub','.archive','.curator_backups','.locks','.venv','venv','node_modules','site-packages','__pycache__','.tox','.nox','.pytest_cache','.mypy_cache','.ruff_cache']);
const support=new Set(['references','templates','assets','scripts']);
export function hermesConfig(home,hermesHome){
 const path=join(hermesHome,'config.yaml');let raw=null;
 try{if(statSync(path).size>1048576)throw Error();raw=readFileSync(path,'utf8');}catch(e){if(e.code!=='ENOENT')throw Error('Cannot safely read Hermes settings.');}
 const doc=parseDocument(raw??'');
 if(doc.errors.length)throw Error('Invalid Hermes settings YAML.');
 let data;try{data=doc.toJS({maxAliasCount:50})??{};}catch{throw Error('Unsupported Hermes settings YAML.');}
 if(typeof data!=='object'||Array.isArray(data)||data.skills!=null&&(typeof data.skills!=='object'||Array.isArray(data.skills)))throw Error('Unsupported Hermes skills settings.');
 const skills=data.skills??{};
 const list=(v)=>{if(v==null)return[];if(typeof v==='string')return[v];if(!Array.isArray(v)||!v.every(x=>typeof x==='string'))throw Error('Invalid Hermes skill list.');return v;};
 const expand=v=>resolve(hermesHome,v.replace(/\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))/g,(m,a,b)=>(a??b)==='HOME'?home:process.env[a??b]??m).replace(/^~(?=\/|$)/,home));
 const externalDirs=list(skills.external_dirs),createDir=skills.create_dir??'';
 if(typeof createDir!=='string'||skills.project_discovery!=null&&typeof skills.project_discovery!=='boolean')throw Error('Invalid Hermes skill settings.');
 const trustedProjects=list(skills.trusted_project_dirs).map(expand),disabled=list(skills.disabled),autoLoad=list(skills.auto_load);
 const local=actual(join(hermesHome,'skills'));
 const directories=[createDir,...externalDirs].filter(Boolean).map(expand).filter(p=>{try{return statSync(p).isDirectory()&&actual(p)!==local;}catch{return false;}}).map(actual);
 let bundledVersions={};let bundled=[];try{bundled=readFileSync(join(hermesHome,'skills/.bundled_manifest'),'utf8').split(/\r?\n/).map(x=>{const [name,hash]=x.split(':');if(hash?.trim())bundledVersions[name.trim()]=hash.trim();return name.trim();}).filter(Boolean);}catch{}
 return {path,raw,doc,skills,expand,revision:hash(raw===null?'missing':`present:${raw}`),hermesHome,externalDirs,createDir,projectDiscovery:skills.project_discovery!==false,trustedProjects,disabled,autoLoad,bundledVersions,directories:[...new Set(directories)],bundled,warnings:[]};
}
export function inspectHermes(home,hermesHome,project=null){
 const c=hermesConfig(home,hermesHome);let projectRoot=null;
 if(project){let p=resolve(project);for(let i=0;i<64;i++){if(existsSync(join(p,'.git'))){if(actual(p)!==actual(home))projectRoot=p;break;}if(dirname(p)===p)break;p=dirname(p);}}
 const trusted=!!projectRoot&&c.trustedProjects.some(p=>actual(p)===actual(projectRoot));
 const roots=[];
 const add=(path,tier,origin,inScope,eligible)=>{if(!roots.some(r=>actual(r.path)===actual(path)))roots.push({path,tier,origin,inScope,eligible});};
 if(project){for(const suffix of ['.hermes/skills','.agents/skills'])add(join(project,suffix),0,'project',true,c.projectDiscovery&&trusted&&actual(project)===actual(projectRoot??''));}
 if(projectRoot&&actual(projectRoot)!==actual(project))for(const suffix of ['.hermes/skills','.agents/skills'])add(join(projectRoot,suffix),0,'project',false,c.projectDiscovery&&trusted);
 add(join(hermesHome,'skills'),1,'local',!project,true);
 if(c.createDir)add(c.expand(c.createDir),2,'created',!project,true);
 for(const dir of c.externalDirs)add(c.expand(dir),3,'external',!project,true);
 let hub={};try{const p=join(hermesHome,'skills/.hub/lock.json');if(statSync(p).size>1048576)throw Error();hub=JSON.parse(readFileSync(p,'utf8')).installed??{};}catch(e){if(e.code!=='ENOENT')c.warnings.push('Hermes Hub records could not be inspected.');}
 const rows=[];let visited=0;
 for(const root of roots){const seen=new Set();
  function visit(p,depth){if(depth>32||++visited>10000||rows.length>=2000){c.warnings.push('Hermes skill inspection limit exceeded.');return;}
   let real;try{real=actual(p);if(!statSync(p).isDirectory()||seen.has(real))return;}catch{return;}seen.add(real);
   const file=join(p,'SKILL.md'),has=existsSync(file);
   if(has)try{if(statSync(file).size>1048576)throw Error();const raw=readFileSync(file,'utf8'),fm=raw.replace(/^\uFEFF/,'').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);const doc=parseDocument(fm?.[1]??'');if(doc.errors.length)throw Error();const meta=doc.toJS({maxAliasCount:30})??{};
    const name=typeof meta.name==='string'&&meta.name.trim()?meta.name.trim():basename(p),description=typeof meta.description==='string'?meta.description:'';
    const record=hub[name];let origin=root.origin;
    if(root.tier===1){if(record&&typeof record.install_path==='string'&&!relative(join(hermesHome,'skills'),resolve(hermesHome,'skills',record.install_path)).startsWith('..')&&actual(resolve(hermesHome,'skills',record.install_path))===actual(p))origin='hub';else if(c.bundled.includes(name))origin='builtin';}
    const platform=process.platform==='darwin'?'macos':process.platform==='win32'?'windows':'linux';
    const osMismatch=Array.isArray(meta.platforms)&&meta.platforms.length>0&&!meta.platforms.includes(platform);
    const conditional=!!(meta.environments||meta.requires_apps||meta.metadata?.hermes&&['requires_tools','requires_toolsets','fallback_for_tools','fallback_for_toolsets','session_platforms'].some(k=>meta.metadata.hermes[k]?.length));
    const rel=relative(root.path,p).split(sep).join('/');
    rows.push({path:actual(p),file:actual(file),rulePath:file,name,description,origin,inScope:root.inScope,tier:root.tier,root:resolve(root.path),relativePath:rel,documentRevision:hash(raw),version:origin==='builtin'?(c.bundledVersions[name]??null):origin==='hub'?(record.metadata?.source_revision||record.content_hash||null):null,eligible:root.eligible,osMismatch,conditional,cliAddressable:root.inScope&&dirname(p)===(project?join(resolve(project),'.hermes/skills'):join(resolve(hermesHome),'skills')),platformDisabled:c.skills.platform_disabled??{},shadowed:false,ambiguous:false,loadName:name});
   }catch{c.warnings.push(`Invalid Hermes skill: ${p}`);}
   try{for(const entry of readdirSync(p,{withFileTypes:true})){if(excluded.has(entry.name)||has&&support.has(entry.name))continue;const child=join(p,entry.name);if(entry.isDirectory()||entry.isSymbolicLink())visit(child,depth+1);}}catch{c.warnings.push(`Cannot inspect Hermes skill directory: ${p}`);}
  }
  visit(resolve(root.path),0);
 }
 // Resolve declared names, folder aliases and relative paths at the same tier before display filtering.
 const aliases=new Map();for(let i=0;i<rows.length;i++){const row=rows[i];if(!row.eligible)continue;for(const key of new Set([row.name,basename(dirname(row.rulePath)),row.relativePath]))aliases.set(key,[...(aliases.get(key)??[]),i]);}
 function winner(ids){if(!ids?.length)return null;const tier=Math.min(...ids.map(i=>rows[i].tier)),top=ids.filter(i=>rows[i].tier===tier);if(top.length===1)return top[0];
  if(new Set(top.map(i=>rows[i].root)).size===1&&new Set(top.map(i=>rows[i].documentRevision)).size===1){top.sort((a,b)=>rows[a].relativePath.split('/').length-rows[b].relativePath.split('/').length);if(rows[top[0]].relativePath.split('/').length<rows[top[1]].relativePath.split('/').length)return top[0];}return null;}
 for(let i=0;i<rows.length;i++){const row=rows[i];if(!row.eligible){row.loadName=row.name;}else{const ids=aliases.get(row.name),w=winner(ids);row.shadowed=ids.some(j=>rows[j].tier<row.tier)||w!==null&&w!==i;row.ambiguous=!row.shadowed&&w===null;row.loadName=row.shadowed?null:row.ambiguous?(winner(aliases.get(row.relativePath))===i?row.relativePath:null):row.name;}
  row.enabled=row.name==='hermes-agent'||!c.disabled.includes(row.name)&&!c.disabled.includes(row.loadName);
  row.autoLoad=c.autoLoad.includes(row.loadName??row.name);
  row.canToggle=row.name!=='hermes-agent'&&!row.shadowed&&!!row.loadName;
  row.canPreload=!row.shadowed&&!!row.loadName;
  row.reason=!row.eligible?(!c.projectDiscovery?'discoveryDisabled':!projectRoot?'noProject':!trusted?'untrusted':'differentRoot'):row.shadowed?'shadowed':row.ambiguous?'ambiguous':!row.enabled?'disabled':row.osMismatch?'platform':row.conditional?'conditional':row.tier===0?'scanUnverified':null;
 }
 const {raw,doc,skills,expand,...publicConfig}=c;
 return {...publicConfig,target:{host:"local",scope:project?"project":"global",projectPath:project},projectRoot,projectTrusted:trusted,skills:rows,warnings:[...new Set(c.warnings)]};
}
if(process.argv[1]===fileURLToPath(import.meta.url))try{const[home,hermesHome,project]=process.argv.slice(2);console.log(JSON.stringify(inspectHermes(home,hermesHome,project||null)));}catch{process.stderr.write('Cannot inspect Hermes skill settings. Check config.yaml.');process.exitCode=1;}
