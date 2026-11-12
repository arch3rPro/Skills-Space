// Derive read-only Agent paths from the pinned upstream CLI.
export function readUpstreamAgents(code) {
  const table = code.split("const agents = {\n")[1]?.split("\n};\nasync function detectInstalledAgents")[0];
  if (!table) throw new Error("Upstream Agent table changed; review the adapter.");
  // Detection observes configuration paths from the same pinned upstream table.
  function detection(id) {
    const block = table.split(`name: "${id}"`)[1]?.split(/\n\t(?:"[^\n]+"|[\w-]+): \{/)[0] ?? "";
    const paths = [...block.matchAll(/existsSync\(join\((\w+|process\.cwd\(\)), ((?:"[^"]+"[, ]*)+)\)\)/g)].map(([, base, parts]) => ({ base: base === "process.cwd()" ? "cwd" : base, path: [...parts.matchAll(/"([^"]+)"/g)].map((m) => m[1]).join("/") }));
    for (const [, base] of block.matchAll(/existsSync\((\w+)\)/g)) paths.push({ base, path: "" });
    for (const [, path] of block.matchAll(/existsSync\("([^"]+)"\)/g)) paths.push({ base: "absolute", path });
    if (block.includes("isMiniMaxCodeInstalled()")) paths.push({base:"home",path:".minimax"},{base:"absolute",path:"/Applications/MiniMax Code.app"});
    if (block.includes("isPositAssistantInstalled()")) paths.push({base:"home",path:".posit/assistant"},{base:"home",path:".positai"});
    if (block.includes("isKimchiInstalled()")) paths.push({ base: "home", path: ".config/kimchi" });
    if (block.includes("isZCodeInstalled()")) paths.push({ base: "home", path: ".zcode" }, { base: "absolute", path: "/Applications/ZCode.app" });
    return { detectionPaths: paths, universalVisible: !block.includes("showInUniversalList: false"), globalReadsCanonical: !block.includes("globalReadsCanonical: false"), detectionDependency: block.includes('packageJsonHasDependency(join(cwd, "package.json"), "eve")') ? "eve" : null };
  }
  const agents = [...table.matchAll(/name: "([^"]+)",\n\s*displayName: "([^"]+)",\n\s*skillsDir: "([^"]+)",\n\s*globalSkillsDir: ([^\n]+)/g)].map(([, id, name, projectPath, expression]) => {
    const globalExpression = expression.replace(/,$/, "");
    if (globalExpression === "void 0") return { id, name, projectPath, ...detection(id), globalBase: null, globalPath: "" };
    if (globalExpression === "getOpenClawGlobalSkillsDir()") return { id, name, projectPath, ...detection(id), globalBase: "openclaw", globalPath: "skills" };
    const join = /^join\((\w+), (.+)\)$/.exec(globalExpression);
    if (!join) throw new Error(`Unsupported upstream path: ${globalExpression}`);
    const segments = [...join[2].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    if (!segments.length || segments.some((part) => part.includes(".."))) throw new Error("Invalid upstream path.");
    return { id, name, projectPath, ...detection(id), globalBase: join[1], globalPath: segments.join("/") };
  });
  if (agents.length !== 79) throw new Error(`Review upstream Agent coverage: ${agents.length}`);
  return agents;
}
