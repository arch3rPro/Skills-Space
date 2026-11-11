// Shared directory configuration semantics; runtime I/O stays in each adapter.
export const directoryFields = ["customSkillDirs", "includeDefaultRoots", "dshHome", "agentsHome"];
export function expression(value) {
  return !!value && typeof value === "object" && ("__jsExpr" in value || "__js__" in value || Object.values(value).some(expression));
}
export function isProvider(row) {
  return !!row && !row.group && ["@deepseek-ai/dsh-skill-filesystem", "@skills-space/dsh-skill-policy"].includes(row.name);
}
export function providerConfig(row) {
  return row?.name === "@skills-space/dsh-skill-policy" ? row.config?.filesystem ?? {} : row?.config ?? {};
}
export function unresolvedDirectoryFields(config) {
  return directoryFields.filter(key => expression(config?.[key]) || expressionRoot(config));
}
function expressionRoot(value) {
  return !!value && typeof value === "object" && ("__jsExpr" in value || "__js__" in value);
}

const creatorSkillsExpression = "process.getBuiltinModule('node:path').join(process.getBuiltinModule('node:path').dirname(process.getBuiltinModule('node:module').createRequire(baseUrl).resolve('@deepseek-ai/dsh-agent-preset/package.json')), 'skills')";

export function additionalDirectoryLayout(config) {
  const entries = config?.customSkillDirs;
  if (!Array.isArray(entries) || !entries.some(expressionRoot) ||
    !entries.every(entry => typeof entry === "string" || expressionRoot(entry))) return undefined;
  const rules = entries.filter(expressionRoot);
  const isBuiltin = entry => (entry.__jsExpr ?? entry.__js__) === creatorSkillsExpression;
  return {
    entries: entries.map(entry => typeof entry === "string" ? entry : null),
    builtin: rules.some(isBuiltin),
    dynamic: rules.some(entry => !isBuiltin(entry)),
  };
}

export function restoreAdditionalDirectoryRules(current, entries) {
  const rules = Array.isArray(current) ? current.filter(expressionRoot) : [];
  if (entries.filter(entry => entry === null).length !== rules.length) {
    throw new Error("Skill directory rules changed");
  }
  let index = 0;
  return entries.map(entry => entry === null ? rules[index++] : entry);
}

export function directoryDeclarationStatus(plugins) {
  if (plugins === undefined) return "none";
  if (!Array.isArray(plugins)) return "unknown";
  let unknown = false;
  for (const row of plugins) {
    if (!row || typeof row !== "object") { unknown = true; continue; }
    if (isProvider(row)) return "available";
    if (row.group) {
      const status = directoryDeclarationStatus(row.config);
      if (status === "available") return status;
      if (status === "unknown") unknown = true;
    }
  }
  return unknown ? "unknown" : "none";
}
