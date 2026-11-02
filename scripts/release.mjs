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
export function prepare(directory,releasesFile,root='.',env=process.env) {
  const appVersion=version(root);
  const sha=env.BUILD_SHA;
  const checksums=[];
  const staged=[];
  for (const platform of platforms) {
    const folder=join(directory,`installers-${platform.id}`);
    const record=json(join(folder,'build.json'));
    if (record.version!==appVersion || record.sha!==sha || record.runId!==env.BUILD_RUN_ID || record.platform!==platform.id) throw new Error('Installers must come from the same selected build and version.');
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
  const compare=prior?`\n变更对比：https://github.com/${env.GH_REPO}/compare/${previous}...${sha}\n`:'';
  writeFileSync(join(output,'RELEASE_NOTES.md'),notes+`\n构建提交：${sha}\n随包 skills CLI：${json(join(root,'package.json')).dependencies.skills}\n`+compare);
}
if (process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]) {
  const [command,...args]=process.argv.slice(2);
  if (command==='matrix') {
    const selected=args[0]==='all'?platforms:platforms.filter(p=>p.id===args[0]);
    if (!selected.length) throw new Error('Unknown platform selection.');
    console.log(`value=${JSON.stringify({include:selected})}`);
  } else if(command==='version') console.log(version());
  else if(command==='collect') collect(args[0]);
  else if(command==='prepare') prepare(args[0],args[1]);
  else throw new Error('Expected matrix, version, collect, or prepare.');
}
