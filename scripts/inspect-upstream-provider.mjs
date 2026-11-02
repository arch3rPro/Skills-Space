// Read-only discovery/download expectations from the unchanged pinned provider.
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { createHash } from "node:crypto";
import { crc32, gunzipSync, inflateRawSync } from "node:zlib";
import { parse } from "./skills/node_modules/yaml/dist/index.js";

try {
const code = await readFile(new URL("./skills/dist/cli.mjs", import.meta.url), "utf8");
function block(start, end) {
  const a=code.indexOf(start), b=code.indexOf(end,a);
  if(a<0||b<a) throw new Error("Review pinned provider boundaries.");
  return code.slice(a,b);
}
const functions=block("function parseFrontmatter(raw) {","function isContainedIn(")
  +block("const CSI_RE =","const silentOutput =")
  +block("const ZIP_LOCAL_FILE_HEADER =", "const DISCOVERY_SCHEMA_V2 =")
  +block("const DISCOVERY_SCHEMA_V2 =","const wellKnownProvider =");
function safeUrl(input) {
  const u=new URL(input);
  if(!["http:","https:"].includes(u.protocol)||u.username||u.password||u.search||u.hash) throw new Error("Downloads require HTTP(S) URLs without credentials, query or fragment.");
  return u;
}
const source=process.argv[2];
safeUrl(source);
let requests=0, networkBytes=0;
const failures=[];
async function boundedFetch(input,options={}) {
  try {
    let url=safeUrl(input);
    for(let redirects=0;redirects<=5;redirects++) {
      if(++requests>1000) throw new Error("Download request limit exceeded.");
      const response=await fetch(url,{redirect:"manual",signal:AbortSignal.timeout(10000),headers:options.headers});
      if([301,302,303,307,308].includes(response.status)) {
        const next=response.headers.get("location");
        await response.body?.cancel();
        if(!next) throw new Error("Redirect has no destination.");
        url=safeUrl(new URL(next,url)); continue;
      }
      const limit=url.pathname.endsWith("/index.json")?1024*1024:512*1024;
      if(Number(response.headers.get("content-length"))>limit) {await response.body?.cancel();throw new Error("Download exceeds preview limits.");}
      let size=0;const parts=[];
      if(response.body) for await(const part of response.body) {
        size+=part.length;networkBytes+=part.length;
        if(size>limit||networkBytes>4*1024*1024) throw new Error("Download exceeds preview limits.");
        parts.push(part);
      }
      const bytes=Buffer.concat(parts);
      if(!response.ok&&!url.pathname.endsWith("/index.json")) failures.push("A required download failed.");
      return {ok:response.ok,headers:response.headers,
        json:async()=>JSON.parse(bytes.toString("utf8")),text:async()=>bytes.toString("utf8"),
        arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
    }
    throw new Error("Too many download redirects.");
  } catch(error) { failures.push(`${String(error)}${error.cause?.code ? ` (${error.cause.code})` : ""}`);throw error; }
}
const contract=runInNewContext(functions+block("async function checkWellKnownForUpdates(baseUrl, items) {","function printNewSkills(")+"\nconst wellKnownProvider=new WellKnownProvider(); ({provider:wellKnownProvider,digest:computeWellKnownSkillDigest,check:checkWellKnownForUpdates});",{
  URL,AbortSignal,Buffer,TextDecoder,Uint8Array,parse,crc32,fetch:boundedFetch,createHash$1:createHash,
  gunzipSync:(bytes)=>gunzipSync(bytes,{maxOutputLength:1024*1024}),
  inflateRawSync:(bytes)=>inflateRawSync(bytes,{maxOutputLength:1024*1024}),
},{timeout:1000});
const provider=contract.provider;
if(process.argv[3]==="--document") {
 const name=process.argv[4];
 if(!provider.isValidSkillName(name))throw new Error("Invalid skill name.");
 const candidates=await provider.fetchIndexCandidates(source);
 let document=null;
 for(const candidate of candidates) {
  const entries=candidate.entries.filter(entry=>entry.name===name);
  if(entries.length>1)throw new Error("Ambiguous skill document identity.");
  if(!entries.length)continue;
  const entry=entries[0];
  // v1 document browsing needs only SKILL.md. v2 retains the original digest/archive checks.
  const skill=await provider.fetchSkillByEntry(entry.version==="0.1.0"?{...entry,files:["SKILL.md"]}:entry);
  if(!skill)throw new Error("Could not read the declared skill document.");
  if(Buffer.byteLength(skill.content)>256*1024)throw new Error("Skill document exceeds the size limit.");
  document={content:skill.content};break;
 }
 if(!document)throw new Error("Skill document is not in the published index.");
 console.log(JSON.stringify(document));
} else if(process.argv[3]==="--check-name") {
 const result=await contract.check(source,[{name:process.argv[4],digest:process.argv[5]}]);
 if(failures.length)throw new Error("Update check was incomplete.");
 console.log(JSON.stringify(result));
} else if(process.argv[3]==="--contract") {
  if(!provider.normalizeIndex({skills:[{name:"fixture",description:"Fixture",files:["SKILL.md"]}]},"https://fixture.invalid/.well-known/skills/index.json",".well-known/skills")) throw new Error("Provider contract changed.");
  console.log(JSON.stringify({contract:true}));
} else {
  const candidates=await provider.fetchIndexCandidates(source);
  const scope=provider.getScope(source);
  const eligible=scope?candidates.filter(c=>c.resolvedBaseUrl!==scope.rootBaseUrl):candidates;
  if(scope&&eligible.length===0&&candidates.length)throw new Error("No index for the scoped URL; refusing the host root index.");
  let selected=null;
  for(const candidate of eligible) {
    if(candidate.entries.length>200) throw new Error("Provider exceeds 200 skill limit.");
    const before=failures.length;
    const skills=[];
    for(const entry of candidate.entries) {
      if(entry.version==="0.1.0"&&entry.files.length>200) throw new Error("Provider exceeds file limit.");
      skills.push(await provider.fetchSkillByEntry(entry));
    }
    if(skills.some(Boolean)) {
      if(skills.some(s=>!s)||failures.length!==before) throw new Error("Provider preview is incomplete; no installation was started.");
      selected=skills;break;
    }
  }
  if(!selected?.length && !candidates.length && !failures.length) { console.log(JSON.stringify({directDownload:true})); process.exit(0); }
  if(!selected?.length) throw new Error((candidates.length ? "An index was found, but no complete skill download could be verified. Check the files, digest and document format. " : "No complete well-known skill index was found. Standalone download URLs require an upstream-supported index. ") + failures.slice(0,8).join("; "));
  let total=0,fileTotal=0;const names=new Set();const result=[];
  for(const skill of selected) {
    if(skill.name!==skill.installName) throw new Error("Index installation name differs from document name; this identity requires further GUI support.");
    if(names.has(skill.installName.toLowerCase())) throw new Error("Duplicate provider installation names.");
    names.add(skill.installName.toLowerCase());
    const files=[];const normalized=new Set();
    for(const [path,content] of skill.files) {
      if(provider.normalizeArchivePath(path)!==path||path.split("/").some(p=>[".git","node_modules"].includes(p))||normalized.has(path.toLowerCase())) throw new Error("Unsafe or ambiguous download file path.");
      normalized.add(path.toLowerCase());
      const bytes=typeof content==="string"?Buffer.from(content):Buffer.from(content);
      total+=bytes.length;
      if(++fileTotal>2000) throw new Error("Provider file count exceeds limits.");
      if(total>512*1024||files.length>=200) throw new Error("Provider content exceeds preview limits.");
      files.push([path,bytes]);
    }
    if(Buffer.byteLength(skill.content)>256*1024||!skill.description) throw new Error("Invalid or oversized skill document.");
    // A file cannot also be the parent directory of another file.
    for(const [path] of files) for(const [other] of files) if(other.startsWith(path+"/")) throw new Error("Conflicting download file paths.");
    const hash=createHash("sha256");
    for(const [path,bytes] of [...files].sort((a,b)=>a[0].localeCompare(b[0]))) hash.update(path).update(bytes);
    const fingerprint=hash.digest("hex");
    result.push({sourceIdentifier:provider.getSourceIdentifier(source),name:skill.installName,description:skill.description,content:skill.content,
      internal:skill.metadata?.internal===true,sourceUrl:skill.sourceUrl,fingerprint,digest:contract.digest(skill),
      selectionFingerprint:JSON.stringify([fingerprint,skill.sourceUrl,skill.indexEntry]),
      files:files.map(([path,bytes])=>[path,bytes.toString("hex")])});
  }
  const output=JSON.stringify(result);
  if(Buffer.byteLength(output)>1800*1024) throw new Error("Provider preview output exceeds limits.");
  console.log(output);
}
} catch (error) {
  process.stderr.write(`${error.message ?? String(error)}\n`);
  process.exitCode = 1;
}
