import assert from "node:assert/strict";
import test from "node:test";
import { formatExecutionLog } from "./execution-log.ts";

test("terminal presentation controls normalize to readable Unicode lines", () => {
  const cases = [
    ["colour/cursor", "\u001b[?25l│\n◇  Found 2 skills\n\u001b[?25h\u001b[32m安装成功 中文目录\u001b[0m", "│\n◇  Found 2 skills\n安装成功 中文目录"],
    ["BEL hyperlink", "\u001b]8;;https://example.com\u0007技能\u001b]8;;\u0007", "技能"],
    ["ST hyperlink", "\u001b]8;;https://example.com\u001b\\skill\u001b]8;;\u001b\\", "skill"],
    ["repaint/backspace", "Preparing\rInstalled\r\n进度x\b完成\n", "Installed\n进度完成\n"],
    ["decorative logo", "███████╗██╗\n╚══════╝╚═╝\n◇  技能已安装\n│ ~/.agents/skills", "◇  技能已安装\n│ ~/.agents/skills"],
  ];
  for (const [label, input, expected] of cases) assert.equal(formatExecutionLog(input), expected, label);
});
test("plain diagnostics, paths, tabs and empty input remain unchanged", () => {
  for (const text of ["Failed: permission denied\n\t~/.agents/skills/技能\n", ""]) assert.equal(formatExecutionLog(text), text);
});
