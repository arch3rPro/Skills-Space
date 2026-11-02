import test from "node:test";
import assert from "node:assert/strict";
import { groupDirectoryDiagnostics, directoryDiagnosticMessage } from "./directory-diagnostics.ts";
import type { DiagnosticResult } from "./directory-diagnostics.ts";

test("directory diagnostics count shared observations once while retaining affected scopes and distinct paths", () => {
  const shared = "DSH /home/.dsh/profiles/tauri/package.json: bundle missing-package could not be resolved";
  const results: DiagnosticResult[] = [
    { name: "全局", target: { host: "local", scope: "global", projectPath: null }, warnings: [shared, shared, "Broken link: /home/skills/a"], error: null },
    { name: "项目 A", target: { host: "local", scope: "project", projectPath: "/repo/a" }, warnings: [shared, "Broken link: /repo/a/skills/a"], error: null },
    { name: "项目 B", target: { host: "local", scope: "project", projectPath: "/repo/b" }, warnings: [shared], error: null },
    { name: "失败项目", target: { host: "local", scope: "project", projectPath: "/repo/missing" }, warnings: [], error: "Cannot inspect project" },
  ];
  const grouped = groupDirectoryDiagnostics(results);
  assert.equal(grouped.issues, 3);
  assert.deepEqual(grouped.groups.find(group => group.warnings.includes(shared))?.names, ["全局", "项目 A", "项目 B"]);
  assert.deepEqual(grouped.groups.find(group => group.warnings.includes(shared))?.paths, ["/repo/a", "/repo/b"]);
  assert.equal(grouped.groups.flatMap(group => group.warnings).filter(value => value === shared).length, 1);
  assert.deepEqual(groupDirectoryDiagnostics([]), { issues: 0, groups: [] });
  assert.equal(results[3].error, "Cannot inspect project");
});

test("directory diagnostics preserve concrete DSH causes and paths in both languages", () => {
  const prefix = "DSH /home/.dsh/profiles/tauri/package.json: bundle @fixture/demo ";
  for (const [cause, expected] of [
    ["could not be resolved", "找不到插件包 @fixture/demo"],
    ["configuration could not be read", "无法读取插件包 @fixture/demo 的配置"],
    ["is incompatible with runtime 0.2.1-rc.3", "不兼容当前 DSH 版本 0.2.1-rc.3"],
  ]) {
    const raw = prefix + cause;
    assert.ok(directoryDiagnosticMessage(raw, true).includes(expected));
    assert.ok(directoryDiagnosticMessage(raw, true).includes("/home/.dsh/profiles/tauri/package.json"));
    assert.equal(directoryDiagnosticMessage(raw, false), raw);
  }
  assert.equal(directoryDiagnosticMessage("Broken link: /home/skill", true), "失效链接：/home/skill");
  assert.match(directoryDiagnosticMessage("DSH configuration reader is unavailable for this installation", true), /无法读取 DSH 配置/);
  assert.equal(directoryDiagnosticMessage("Other warning", true), "Other warning");
});
