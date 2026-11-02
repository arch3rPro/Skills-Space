import assert from "node:assert/strict";
import test from "node:test";
import { formatExecutionLog } from "./execution-log.ts";

test("upstream cursor and colour sequences disappear without damaging Unicode", () => {
  assert.equal(formatExecutionLog("\u001b[?25l│\n◇  Found 2 skills\n\u001b[?25h\u001b[32m安装成功 中文目录\u001b[0m"), "│\n◇  Found 2 skills\n安装成功 中文目录");
});
test("terminal links retain their displayed text", () => {
  assert.equal(formatExecutionLog("\u001b]8;;https://example.com\u0007技能\u001b]8;;\u0007"), "技能");
  assert.equal(formatExecutionLog("\u001b]8;;https://example.com\u001b\\skill\u001b]8;;\u001b\\"), "skill");
});
test("progress repaint and backspace preserve the final readable line", () => {
  assert.equal(formatExecutionLog("Preparing\rInstalled\r\n进度x\b完成\n"), "Installed\n进度完成\n");
});
test("plain logs, tabs, empty text and failure diagnostics are preserved", () => {
  const text = "Failed: permission denied\n\t~/.agents/skills/技能\n";
  assert.equal(formatExecutionLog(text), text);
  assert.equal(formatExecutionLog(""), "");
});

test("decorative CLI logo is omitted while meaningful Unicode lines remain", () => {
  assert.equal(formatExecutionLog("███████╗██╗\n╚══════╝╚═╝\n◇  技能已安装\n│ ~/.agents/skills"), "◇  技能已安装\n│ ~/.agents/skills");
});
