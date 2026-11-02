import assert from "node:assert/strict";
import test from "node:test";
import { errorSummary } from "./error-summary.ts";

test("project validation keeps its specific cause in both languages", () => {
  assert.equal(errorSummary("Choose a folder and enter a project name.", false), "Choose a folder and enter a project name.");
  assert.equal(errorSummary("Choose a folder and enter a project name.", true), "请选择目录并填写项目名称。");
  assert.equal(errorSummary("This folder is already registered.", false), "This folder is already registered.");
});

test("empty source and missing explicitly selected skill have different guidance", () => {
  assert.match(errorSummary("No reliably previewable skills. Invalid document", true) ?? "", /有效的 SKILL.md/);
  assert.match(errorSummary("The source skill filter does not identify one visible skill. Review the name or explicitly show internal skills; no installation was started.", true) ?? "", /显示内部技能/);
});
test("known transport diagnostics have readable bilingual summaries", () => {
  assert.match(errorSummary("fatal: Could not resolve host: github.com", true) ?? "", /无法连接来源/);
  assert.match(errorSummary("error sending request for url (https://example.com)", false) ?? "", /Could not connect/);
});
test("filesystem and invalid source diagnostics retain distinct causes", () => {
  assert.match(errorSummary("Choose an existing absolute local directory; the interface expands ~ before preview.", true) ?? "", /本地来源/);
  assert.match(errorSummary("No such file or directory (os error 2)", true) ?? "", /找不到/);
  assert.match(errorSummary("Permission denied (os error 13)", true) ?? "", /权限/);
  assert.match(errorSummary("Unsupported repository protocol.", true) ?? "", /地址格式/);
});
test("unknown technical messages are not assigned an invented cause", () => {
  assert.equal(errorSummary("Unexpected native response: 17", true), null);
  assert.equal(errorSummary("Source not found in saved locks", true), null);
  assert.equal(errorSummary("Network update pending", false), null);
});
test("short Chinese validation stays readable and long logs remain in details", () => {
  assert.equal(errorSummary("该项目目录已添加。\nAdditional diagnostic", true), "该项目目录已添加。");
  assert.equal(errorSummary("错误".repeat(90), true), null);
  assert.equal(errorSummary("", true), null);
});


test("native Agent skill restrictions explain where to manage the source", () => {
  assert.equal(errorSummary("This Pi skill is outside the upstream CLI installation paths. Manage its source directory or package directly.", true), "此技能由 Pi 原生目录或扩展包提供，请从原目录或扩展包管理。");
  assert.equal(errorSummary("These Hermes skills are outside the upstream CLI installation paths. Manage them in Hermes or open their directories.", false), "Manage these skills in Hermes or their source folders.");
});


test("installation rechecks distinguish expiry, changed content and unavailable sources", () => {
  assert.equal(errorSummary("Source inspection fingerprints are unavailable. Inspect again before installing.", true), null); // Retired gate has no active producer.
  assert.match(errorSummary("Source inspection expired. Inspect again.", true) ?? "", /检查已失效/);
  assert.match(errorSummary("Source content changed since preview. Inspect again before confirming installation.", true) ?? "", /来源已变化/);
  assert.match(errorSummary("Cannot recheck source repository: fatal: unavailable", true) ?? "", /检查来源/);
});


test("sync guards distinguish content drift, occupied targets and missing origins", () => {
  assert.equal(errorSummary("Sync source and installed content differ or cannot be verified. Check updates or local changes first.", true), null);
  assert.equal(errorSummary("Sync shared content differs or cannot be verified. Review the shared installation first.", true), null);
  assert.match(errorSummary("Sync target already contains this skill or a conflicting path. Check targets again.", true) ?? "", /目标目录已被占用/);
  assert.match(errorSummary("Sync origin is no longer installed. Refresh and check again.", true) ?? "", /原技能已移除/);
  assert.match(errorSummary("Sync source has no unique matching skill. Check the installation source.", false) ?? "", /source or skill record changed/);
});

 test("Pi bulk failure summaries retain the completed-item count", () => {
  assert.match(errorSummary("已完成 1/2 项。Pi invocation can only edit an unchanged independent local skill.",true) ?? "", /^已完成 1\/2 项。/);
  assert.match(errorSummary("1/2 completed. Shared and managed skill files cannot change Pi invocation mode.",false) ?? "", /^1\/2 completed\. /);
});

test('Pi native removal distinguishes stale review, protected content and Trash failures',()=>{
 assert.match(errorSummary('Pi removal content changed. Review again.',true)??'',/重新打开卸载确认/);
 assert.match(errorSummary('Pi removal only supports independent local skills.',true)??'',/不支持单独卸载/);
 assert.match(errorSummary('Cannot move Pi skill to Trash: denied',true)??'',/无法移至废纸篓/);
});


test("DSH inspection failure does not mistake unchanged configuration for drift", () => {
  const message = "DSH skill inspection failed. No configuration was changed.";
  assert.equal(errorSummary(message, true), "无法读取 DSH 设置，请重新读取。");
  assert.equal(errorSummary(message, false), "Could not read DSH settings. Reload and try again.");
  assert.match(errorSummary("DSH configuration changed. Reload before saving.", true) ?? "", /已变化/);
  assert.match(errorSummary("已完成 1/2 项。DSH skill inspection failed. No configuration was changed.", true) ?? "", /^已完成 1\/2 项。无法读取/);
});

test("Pi update and invocation failures retain their cause without leaking known internal diagnostics",()=>{
 const blocked=errorSummary("Package update blocked: local content is modified or cannot be verified.",true)??"";
 const restored=errorSummary("Package content updated; invocation recovery needs review for demo.",true)??"";
 assert.equal(blocked,"");assert.match(restored,/已更新/);assert.match(restored,/未恢复/);
 assert.match(errorSummary("Source default is unverified after an external npm update.",true)??"",/原始调用设置/);
 assert.match(errorSummary("Recovery blocked: source identity or local content changed. Review local edits.",false)??"",/Choose the invocation mode again/);
 const scope=errorSummary("Pi invocation failed",true)??"";assert.match(scope,/调用方式/);assert(!scope.includes("独立本地"));
 assert.equal(errorSummary("Unexpected native response: 17",true),null);
});

test("a restriction does not invent shared files or an unwritable destination", () => {
 assert.match(errorSummary("Pi removal refuses a folder containing other skills.",true) ?? "", /包含其他技能/);
 assert.match(errorSummary("Only independent local DSH skills support this operation.",true) ?? "", /不支持单独修改/);
 assert.ok(!errorSummary("Invocation destination has a linked parent. Review its physical scope.",true)?.includes("不可写"));
 assert.match(errorSummary("Scope preferences conflict.",true) ?? "", /调用设置冲突/);
 assert.match(errorSummary("Invalid invocation recovery journal.",true) ?? "", /调用记录损坏/);
});

test("record persistence reports its stage and existing retry action",()=>{
 assert.equal(errorSummary("Invocation record persistence failed: Invocation destination is read-only.",true),"调用记录未保存，请修改文件权限后重新检查扩展更新。");
 assert.equal(errorSummary("Invocation record persistence failed: Unexpected write result",true),"调用记录未保存，请重新检查扩展更新。");
});

test("project restore and trust diagnostics identify the corrective action",()=>{
 assert.equal(errorSummary("Cannot read skills-lock.json: No such file or directory (os error 2)",true),"项目缺少 skills-lock.json，无法恢复技能。");
 assert.match(errorSummary("Locked dependency skill is absent from node_modules. Install project dependencies and inspect again.",true)!,/安装项目依赖/);
 assert.match(errorSummary("Pi project trust changed. Reload before saving.",true)!,/重新读取/);
 assert.match(errorSummary("Internal skills are not available in this restore workflow.",true)!,/不支持整份恢复/);
});


test('independent Codex authorization distinguishes retry from account-service denial',()=>{
 assert.match(errorSummary('CODEX_AUTH_TIMEOUT',true)??'',/超时/);
 assert.match(errorSummary('CODEX_ACCOUNT_GATEWAY',true)??'',/入口.*权限尚未确认/);
 assert.match(errorSummary('CODEX_ACCOUNT_DENIED',true)??'',/拒绝.*权限/);
 assert.match(errorSummary('CODEX_ACCOUNT_UNVERIFIED',true)??'',/尚未确认操作结果/);
});


test('Codex credential storage failure does not suggest a plaintext fallback',()=>{
 assert.match(errorSummary('CODEX_AUTH_STORAGE',true)??'',/系统凭据存储.*未保存/);
});

test('Node setup failures identify selection, version and download recovery',()=>{
 assert.equal(errorSummary('Node 22.20.0 or later is required.',true),'Node 版本过低，请选择 22.20.0 或更新版本。');
 assert.match(errorSummary('The selected file is not a usable Node executable.',true)??'',/请选择.*Node/);
 assert.match(errorSummary('Official Node checksum mismatch.',true)??'',/重新检测.*手动选择/);
 assert.match(errorSummary('Node download failed: connection refused',false)??'',/connection.*detect again.*manually/);
});
