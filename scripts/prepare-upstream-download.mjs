// Original downloader operates only in an owned preview temporary directory.
import * as fs from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {dirname,join,normalize,resolve,sep} from 'node:path';
import {crc32,inflateRawSync} from 'node:zlib';
import {runInNewContext} from 'node:vm';
import {parse} from './skills/node_modules/yaml/dist/index.js';
import * as tar from './skills/node_modules/tar/dist/esm/index.js';
const code=await fs.readFile(new URL('./skills/dist/cli.mjs',import.meta.url),'utf8');
function block(a,b){const start=code.indexOf(a),end=code.indexOf(b,start);if(start<0||end<start)throw new Error('Review pinned download boundaries.');return code.slice(start,end);}
const functions=block('function parseFrontmatter(raw) {','function isContainedIn(')+block('const ZIP_LOCAL_FILE_HEADER =','const DISCOVERY_SCHEMA_V2 =')+block('const DEFAULT_DOWNLOAD_MAX_BYTES =','async function getSingleTopLevelDirectory(')+block('async function downloadSource(url, options = {}) {','const AGENTS_DIR =');
// This original function has a built-in dynamic import; execute it in the host
// context with only its path dependency, while the downloader uses a bounded VM.
const getSingleTopLevelDirectory=new Function('join$1',block('async function getSingleTopLevelDirectory(','async function downloadSource(')+'\nreturn getSingleTopLevelDirectory;')(join);
function safe(input){const u=new URL(input);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash)throw new Error('Download URL requires HTTP(S) without credentials, query or fragment.');return u;}
async function fetchSafe(input){let url=safe(input);for(let n=0;n<=5;n++){const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(10000)});if([301,302,303,307,308].includes(response.status)){const next=response.headers.get('location');await response.body?.cancel();if(!next)throw new Error('Missing redirect destination.');url=safe(new URL(next,url));continue;}return response;}throw new Error('Too many download redirects.');}
try {
 const root=await fs.realpath(process.argv[3]);
 const original=runInNewContext(functions+'\ndownloadSource',{URL,Buffer,Uint8Array,TextDecoder,AbortSignal,TransformStream,parse,tar,crc32,inflateRawSync,pipeline,createWriteStream,getSingleTopLevelDirectory,
  dirname$1:dirname,join$1:join,normalize$1:normalize,resolve$1:resolve,sep$1:sep,tmpdir$1:()=>root,
  mkdtemp$1:fs.mkdtemp,mkdir$1:fs.mkdir,readFile$1:fs.readFile,writeFile$1:fs.writeFile,rm$1:fs.rm,stat$1:fs.stat,
  process:{env:{}},fetch:fetchSafe},{timeout:1000});
 const result=await original(safe(process.argv[2]).toString(),{downloadMaxBytes:4*1024*1024,extractMaxBytes:4*1024*1024,extractMaxFiles:2000});
 console.log(JSON.stringify(result));
} catch(error){process.stderr.write(`${error.message}\n`);process.exitCode=1;}
