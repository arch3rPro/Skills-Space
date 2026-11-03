import {readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, existsSync} from 'node:fs';
import {join, basename} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const platforms = [
  {id:'macos-arm64',runner:'macos-15',target:'aarch64-apple-darwin',bundles:'dmg',extensions:['.dmg']},
  {id:'macos-x64',runner:'macos-15-intel',target:'x86_64-apple-darwin',bundles:'dmg',extensions:['.dmg']},
  {id:'windows-x64',runner:'windows-2022',target:'x86_64-pc-windows-msvc',bundles:'nsis',extensions:['.exe']},
  {id:'linux-x64',runner:'ubuntu-22.04',target:'x86_64-unknown-linux-gnu',bundles:'appimage,deb',extensions:['.AppImage','.deb']},
];
const json = path => JSON.parse(readFileSync(path,'utf8'));
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
export function version(root='.') {
  const value=json(join(root,'package.json')).version;
  const tauri=json(join(root,'src-tauri/tauri.conf.json')).version;
  const cargo=readFileSync(join(root,'src-tauri/Cargo.toml'),'utf8').match(/^version = "([^"]+)"/m)?.[1];
  const locked=readFileSync(join(root,'src-tauri/Cargo.lock'),'utf8').match(/name = "skills-space"\r?\nversion = "([^"]+)"/)?.[1];
  if (!/^\d+\.\d+\.\d+$/.test(value) || [tauri,cargo,locked].some(v=>v!==value)) throw new Error('Application versions must agree and use stable x.y.z.');
  return value;
}
function filesIn(path) {
  return readdirSync(path,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?filesIn(join(path,entry.name)):entry.isFile()?[join(path,entry.name)]:[]);
}
export function collect(id,root='.',env=process.env) {
  const platform=platforms.find(p=>p.id===id);
  if (!platform) throw new Error('Unknown platform.');
  const appVersion=version(root);
  const source=join(root,'src-tauri/target',platform.target,'release/bundle');
  const selected=filesIn(source).filter(path=>platform.extensions.some(ext=>path.endsWith(ext)));
  for (const ext of platform.extensions) if (selected.filter(p=>p.endsWith(ext)).length!==1) throw new Error(`Expected one ${ext} installer.`);
  if (!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA??'') || !/^\d+$/.test(env.GITHUB_RUN_ID??'')) throw new Error('Missing build provenance.');
  const output=join(root,'release-artifacts',id);
  mkdirSync(output,{recursive:true});
  const files=selected.map(source=>{
    const ext=platform.extensions.find(ext=>source.endsWith(ext));
    const name=`Skills-Space_${appVersion}_${id}${ext}`;
    copyFileSync(source,join(output,name));
    return {name,sha256:hash(source)};
  });
  writeFileSync(join(output,'build.json'),JSON.stringify({version:appVersion,sha:env.GITHUB_SHA,runId:env.GITHUB_RUN_ID,platform:id,files},null,2)+'\n');
}
export function buildSources(baseRun, overrides, load) {
  if (!/^[0-9]+$/.test(baseRun) || !overrides || typeof overrides !== 'object' || Array.isArray(overrides)) throw new Error('Choose a build run and platform-to-run overrides.');
  for (const id of Object.keys(overrides)) if (!platforms.some(p=>p.id===id)) throw new Error('Unknown platform override.');
  const cache=new Map(), sources={};
  for (const platform of platforms) {
    const runId=String(overrides[platform.id]??baseRun);
    if (!/^[0-9]+$/.test(runId)) throw new Error('Invalid platform build run ID.');
    if (!cache.has(runId)) cache.set(runId,load(runId));
    const run=cache.get(runId);
    if (run.status!=='completed' || run.event!=='workflow_dispatch' || run.workflowName!=='Build installers (manual)' || !/^[a-f0-9]{40}$/.test(run.headSha)) throw new Error('Select a completed manual installer build.');
    if (!run.jobs.some(job=>job.name===platform.id && job.status==='completed' && job.conclusion==='success')) throw new Error(`Selected ${platform.id} build did not succeed.`);
    sources[platform.id]={sha:run.headSha,runId};
  }
  return sources;
}
export function prepare(directory,releasesFile,root='.',env=process.env) {
  const appVersion=version(root);
  const sha=env.BUILD_SHA;
  if (!/^[a-f0-9]{40}$/.test(sha??'')) throw new Error('A valid release-record commit is required.');
  const checksums=[];
  const staged=[];
  const sources=env.BUILD_SOURCES_FILE?json(env.BUILD_SOURCES_FILE):null;
  if (sources && (Object.keys(sources).length!==platforms.length || platforms.some(p=>!sources[p.id]))) throw new Error('Select one build source for every platform.');
  const records={};
  for (const platform of platforms) {
    const folder=join(directory,`installers-${platform.id}`);
    const record=json(join(folder,'build.json'));
    const expectedSource=sources?.[platform.id]??{sha,runId:env.BUILD_RUN_ID};
    if (!/^[a-f0-9]{40}$/.test(expectedSource.sha??'') || !/^[0-9]+$/.test(expectedSource.runId??'') || record.version!==appVersion || record.sha!==expectedSource.sha || record.runId!==expectedSource.runId || record.platform!==platform.id) throw new Error('Installers must come from the same selected build and version.');
    records[platform.id]=record;
    const expected=platform.extensions.map(ext=>`Skills-Space_${appVersion}_${platform.id}${ext}`).sort();
    if (JSON.stringify(record.files.map(f=>f.name).sort())!==JSON.stringify(expected)) throw new Error('Incomplete installer set.');
    for (const file of record.files) {
      if (basename(file.name)!==file.name || hash(join(folder,file.name))!==file.sha256) throw new Error('Installer checksum mismatch.');
      staged.push([join(folder,file.name),file.name]);
      checksums.push(`${file.sha256}  ${file.name}`);
    }
  }
  const releases=json(releasesFile).flat();
  const prior=releases.filter(r=>!r.draft&&!r.prerelease&&r.tag_name!==`v${appVersion}`).sort((a,b)=>String(b.published_at).localeCompare(String(a.published_at)))[0];
  const previous=prior?.tag_name??'none';
  const notePath=join(root,'docs/releases',`${appVersion}.md`);
  const notes=readFileSync(notePath,'utf8');
  if (!notes.includes(`<!-- previous-release: ${previous} -->`)) throw new Error(`Release notes must compare against ${previous}.`);
  for (const heading of ['新增功能','功能优化','Bug 修复']) if (!notes.includes(`## ${heading}`)) throw new Error(`Missing release notes section: ${heading}`);
  if (/TODO|待补充|待填写/.test(notes)) throw new Error('Review and finish release notes before preparing a draft.');
  const currentTag=`v${appVersion}`;
  if (existsSync(join(root,'.git'))) {
    const result=execFileSync('git',['tag','--list',currentTag],{cwd:root,encoding:'utf8'}).trim();
    if (result && execFileSync('git',['rev-list','-n','1',currentTag],{cwd:root,encoding:'utf8'}).trim()!==sha) throw new Error('Existing version tag points to a different commit.');
  }
  const output=join(root,'release-output');
  mkdirSync(join(output,'assets'),{recursive:true});
  for (const [source,name] of staged) copyFileSync(source,join(output,'assets',name));
  writeFileSync(join(output,'assets/SHA256SUMS.txt'),checksums.sort().join('\n')+'\n');
  writeFileSync(join(output,'assets/BUILD_SOURCES.json'),JSON.stringify({version:appVersion,releaseCommit:sha,platforms:records},null,2)+'\n');
  const compare=prior?`\n变更对比：https://github.com/${env.GH_REPO}/compare/${previous}...${sha}\n`:'';
  const provenance=platforms.map(p=>`| ${p.id} | ${records[p.id].sha} | [${records[p.id].runId}](https://github.com/${env.GH_REPO}/actions/runs/${records[p.id].runId}) |`).join('\n');
  writeFileSync(join(output,'RELEASE_NOTES.md'),notes+`\n发布记录提交：${sha}\n随包 skills CLI：${json(join(root,'package.json')).dependencies.skills}\n\n## 构建来源\n\n| 平台 | 源码提交 | 构建任务 |\n| --- | --- | --- |\n${provenance}\n`+compare);
}
if (process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]) {
  const [command,...args]=process.argv.slice(2);
  if (command==='matrix') {
    const selected=args[0]==='all'?platforms:platforms.filter(p=>p.id===args[0]);
    if (!selected.length) throw new Error('Unknown platform selection.');
    console.log(`value=${JSON.stringify({include:selected})}`);
  } else if(command==='resolve-builds') {
    const sources=buildSources(args[0],JSON.parse(args[1]||'{}'),id=>JSON.parse(execFileSync('gh',['run','view',id,'--repo',process.env.GH_REPO,'--json','headSha,status,event,workflowName,jobs'],{encoding:'utf8'})));
    for (const {sha} of Object.values(sources)) execFileSync('git',['merge-base','--is-ancestor',sha,process.env.BUILD_SHA]);
    writeFileSync(args[2],JSON.stringify(sources,null,2)+'\n');
  } else if(command==='download-builds') {
    const sources=json(args[0]);
    for (const p of platforms) execFileSync('gh',['run','download',sources[p.id].runId,'--repo',process.env.GH_REPO,'--name',`installers-${p.id}`,'--dir',join(args[1],`installers-${p.id}`)],{stdio:'inherit'});
  } else if(command==='version') console.log(version());
  else if(command==='collect') collect(args[0]);
  else if(command==='prepare') prepare(args[0],args[1]);
  else throw new Error('Expected matrix, resolve-builds, download-builds, version, collect, or prepare.');
}
