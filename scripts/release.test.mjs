import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, cpSync, rmSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {collect, prepare, platforms, version} from './release.mjs';

const source=fileURLToPath(new URL('..', import.meta.url));
const sha='a'.repeat(40);
const env={GITHUB_SHA:sha,GITHUB_RUN_ID:'123',BUILD_SHA:sha,BUILD_RUN_ID:'123',GH_REPO:'example/skills-space'};
function fixture(t) {
  const root=mkdtempSync(join(tmpdir(),'skills-space-release-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  mkdirSync(join(root,'src-tauri'),{recursive:true});
  writeFileSync(join(root,'package.json'),JSON.stringify({version:'0.1.0',dependencies:{skills:'1.7.4'}}));
  writeFileSync(join(root,'src-tauri/tauri.conf.json'),JSON.stringify({version:'0.1.0'}));
  writeFileSync(join(root,'src-tauri/Cargo.toml'),'[package]\nname = "skills-space"\nversion = "0.1.0"\n'.replaceAll('\\n','\n'));
  writeFileSync(join(root,'src-tauri/Cargo.lock'),'[[package]]\nname = "skills-space"\nversion = "0.1.0"\n'.replaceAll('\\n','\n'));
  const notes=join(root,'docs/releases/0.1.0.md');
  mkdirSync(join(root,'docs/releases'),{recursive:true});
  writeFileSync(notes,'<!-- previous-release: none -->\n## 新增功能\n- Initial features\n## 功能优化\n无\n## Bug 修复\n无\n'.replaceAll('\\n','\n'));
  const releases=join(root,'releases.json');
  writeFileSync(releases,'[[]]');
  return {root,notes,releases,downloaded:join(root,'downloaded')};
}
function buildAll(f) {
  for (const platform of platforms) {
    const bundle=join(f.root,'src-tauri/target',platform.target,'release/bundle');
    mkdirSync(bundle,{recursive:true});
    for (const ext of platform.extensions) writeFileSync(join(bundle,`fixture${ext}`),`${platform.id} binary ${ext}`);
    collect(platform.id,f.root,env);
    cpSync(join(f.root,'release-artifacts',platform.id),join(f.downloaded,`installers-${platform.id}`),{recursive:true});
  }
}
function mutateManifest(f,id,edit) {
  const path=join(f.downloaded,`installers-${id}`,'build.json');
  const value=JSON.parse(readFileSync(path,'utf8'));edit(value);writeFileSync(path,JSON.stringify(value));
}

test('four-platform artifacts assemble five installers, checksums and reviewed initial notes without building',t=>{
  const f=fixture(t);buildAll(f);prepare(f.downloaded,f.releases,f.root,env);
  const checksums=readFileSync(join(f.root,'release-output/assets/SHA256SUMS.txt'),'utf8').trim().split('\n');
  assert.equal(checksums.length,5);
  assert.ok(checksums.every(line=>/^[a-f0-9]{64}  Skills-Space_0\.1\.0_/.test(line)));
  const notes=readFileSync(join(f.root,'release-output/RELEASE_NOTES.md'),'utf8');
  assert.match(notes,new RegExp(sha));assert.match(notes,/skills CLI：1\.7\.4/);
  assert.doesNotMatch(notes,/\/compare\//);
});
test('application version check rejects manifest drift and accepts Windows line endings',t=>{
  const f=fixture(t);assert.equal(version(f.root),'0.1.0');
  const lock=join(f.root,'src-tauri/Cargo.lock');writeFileSync(lock,readFileSync(lock,'utf8').replaceAll('\n','\r\n'));
  assert.equal(version(f.root),'0.1.0');
  writeFileSync(join(f.root,'src-tauri/tauri.conf.json'),'{"version":"0.1.1"}');
  assert.throws(()=>version(f.root),/versions must agree/);
});
test('missing platform cannot become a complete release',t=>{
  const f=fixture(t);buildAll(f);rmSync(join(f.downloaded,'installers-linux-x64'),{recursive:true});
  assert.throws(()=>prepare(f.downloaded,f.releases,f.root,env));
  assert.equal(existsSync(join(f.root,'release-output')),false);
});
test('mixed commit, run, version and platform provenance is rejected before output',t=>{
  const f=fixture(t);buildAll(f);
  const manifest=join(f.downloaded,'installers-macos-arm64','build.json');
  const original=readFileSync(manifest,'utf8');
  for (const [name,edit] of [['commit',v=>v.sha='b'.repeat(40)],['run',v=>v.runId='124'],['version',v=>v.version='0.1.1'],['platform',v=>v.platform='linux-x64']]) {
    writeFileSync(manifest,original);
    mutateManifest(f,'macos-arm64',edit);
    assert.throws(()=>prepare(f.downloaded,f.releases,f.root,env),/same selected build and version/,name);
    assert.equal(existsSync(join(f.root,'release-output')),false,name);
  }
});
test('tampered installer bytes and incomplete platform formats are rejected',t=>{
  const f=fixture(t);buildAll(f);
  const binary=join(f.downloaded,'installers-windows-x64/Skills-Space_0.1.0_windows-x64.exe');
  writeFileSync(binary,'tampered');
  assert.throws(()=>prepare(f.downloaded,f.releases,f.root,env),/checksum mismatch/);
  buildAll(f);mutateManifest(f,'linux-x64',v=>v.files.pop());
  assert.throws(()=>prepare(f.downloaded,f.releases,f.root,env),/Incomplete installer set/);
});
test('release notes compare against latest published stable, excluding drafts and prereleases',t=>{
  const f=fixture(t);buildAll(f);
  writeFileSync(f.releases,JSON.stringify([[{tag_name:'v0.0.1',published_at:'2026-01-01',draft:false,prerelease:false},{tag_name:'v9.0.0',published_at:'2026-02-01',draft:true,prerelease:false},{tag_name:'v1.0.0-beta.1',published_at:'2026-03-01',draft:false,prerelease:true}]]));
  assert.throws(()=>prepare(f.downloaded,f.releases,f.root,env),/compare against v0.0.1/);
  writeFileSync(f.notes,readFileSync(f.notes,'utf8').replace('previous-release: none','previous-release: v0.0.1'));
  prepare(f.downloaded,f.releases,f.root,env);
  assert.match(readFileSync(join(f.root,'release-output/RELEASE_NOTES.md'),'utf8'),new RegExp(`compare/v0.0.1\\.\\.\\.${sha}`));
});
test('release notes require all requested sections and reject unfinished content',t=>{
  const f=fixture(t);buildAll(f);const original=readFileSync(f.notes,'utf8');
  writeFileSync(f.notes,original.replace('## Bug 修复','## Other'));
  assert.throws(()=>prepare(f.downloaded,f.releases,f.root,env),/Missing release notes section/);
  writeFileSync(f.notes,original+'TODO');
  assert.throws(()=>prepare(f.downloaded,f.releases,f.root,env),/finish release notes/);
});
test('an existing version tag must refer to the build commit',t=>{
  const f=fixture(t);buildAll(f);
  execFileSync('git',['init','--quiet'],{cwd:f.root});
  execFileSync('git',['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','--allow-empty','--quiet','-m','fixture'],{cwd:f.root});
  execFileSync('git',['tag','v0.1.0'],{cwd:f.root});
  assert.throws(()=>prepare(f.downloaded,f.releases,f.root,env),/tag points to a different commit/);
});
test('collect rejects duplicate installers rather than guessing from stale build outputs',t=>{
  const f=fixture(t);buildAll(f);const platform=platforms[0];
  writeFileSync(join(f.root,'src-tauri/target',platform.target,'release/bundle/stale.dmg'),'old');
  assert.throws(()=>collect(platform.id,f.root,env),/Expected one .dmg/);
});
test('manual platform selection returns only the requested job and rejects unknown targets',()=>{
  const script=join(source,'scripts/release.mjs');
  const out=execFileSync(process.execPath,[script,'matrix','windows-x64'],{encoding:'utf8'});
  const value=JSON.parse(out.trim().slice('value='.length));
  assert.deepEqual(value.include.map(p=>p.id),['windows-x64']);
  assert.throws(()=>execFileSync(process.execPath,[script,'matrix','unknown'],{stdio:'pipe'}));
});
