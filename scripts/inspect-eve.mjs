// Read-only expectations/metadata. All writes remain in the original CLI.
import { readFile, stat } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { parse, stringify } from "./skills/node_modules/yaml/dist/index.js";
import { readUpstream } from "./upstream-readonly.mjs";
const { block } = await readUpstream();
const functions = block("function parseFrontmatter(raw) {", "function isContainedIn(")
  + block("function stripIgnoredEveFrontmatter(raw) {", "function isWithinRoot(");
const input = JSON.parse(process.argv[3]);
if (!Array.isArray(input) || input.length > 2000) throw new Error("Eve inspection exceeds limits.");
if (process.argv[2] === "transform") {
  if (input.some(s => typeof s !== "string") || Buffer.byteLength(JSON.stringify(input)) > 8 * 1024 * 1024) throw new Error("Invalid Eve content.");
  console.log(JSON.stringify(runInNewContext(functions + "\ninput.map(stripIgnoredEveFrontmatter)", {input, parse, stringify}, {timeout:1000})));
} else if (process.argv[2] === "documents") {
  const result=[];
  for (const path of input) {
    try {
      if ((await stat(path + "/SKILL.md")).size > 256*1024) throw new Error("Document exceeds limits.");
      const raw = await readFile(path + "/SKILL.md", "utf8");
      if (Buffer.byteLength(raw)>256*1024) throw new Error("Document exceeds limits.");
      const data=runInNewContext(functions + "\nparseFrontmatter(raw).data",{raw,parse,stringify},{timeout:1000});
      if (typeof data.description !== "string" || !data.description.trim()) throw new Error("Missing Eve description.");
      result.push({path,description:data.description,error:null});
    } catch(e) { result.push({path,error:String(e)}); }
  }
  console.log(JSON.stringify(result));
} else throw new Error("Unknown read-only Eve inspection.");
