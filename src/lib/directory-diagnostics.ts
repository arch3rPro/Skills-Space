import type { Target } from "./upstream";

export type DiagnosticResult = { name: string; target: Target; warnings: string[]; error: string | null };

// Keep every affected scope visible, but count/display the same observation once.
// Different paths remain different issues even if their causes are identical.
export function groupDirectoryDiagnostics(results: DiagnosticResult[]) {
  const warnings = new Map<string, { names: string[]; scopes: string[] }>();
  for (const result of results) {
    const scope = result.target.projectPath ?? "global";
    for (const warning of result.warnings) {
      const entry = warnings.get(warning) ?? { names: [], scopes: [] };
      if (!entry.scopes.includes(scope)) { entry.scopes.push(scope); entry.names.push(result.name); }
      warnings.set(warning, entry);
    }
  }
  const groups = new Map<string, { key: string; names: string[]; paths: string[]; warnings: string[] }>();
  for (const [warning, entry] of warnings) {
    const key = JSON.stringify(entry.scopes);
    const group = groups.get(key) ?? { key, names: entry.names, paths: entry.scopes.filter(scope => scope !== "global"), warnings: [] };
    group.warnings.push(warning);
    groups.set(key, group);
  }
  return { issues: warnings.size, groups: [...groups.values()] };
}

export function directoryDiagnosticMessage(message: string, zh: boolean): string {
  if (!zh) return message;
  if (message === "DSH configuration reader is unavailable for this installation") return "无法读取 DSH 配置：当前安装未提供兼容的配置读取模块。";
  if (message.startsWith("Broken link: ")) return `失效链接：${message.slice(13)}`;
  const bundle = /^DSH (.+): bundle (.+) (could not be resolved|configuration could not be read|is incompatible with runtime (.+))$/.exec(message);
  if (bundle) {
    const [, path, name, cause, version] = bundle;
    return `${path}：${cause === "could not be resolved" ? `找不到插件包 ${name}` : cause === "configuration could not be read" ? `无法读取插件包 ${name} 的配置` : `插件包 ${name} 不兼容当前 DSH 版本 ${version}`}。`;
  }
  return message;
}
