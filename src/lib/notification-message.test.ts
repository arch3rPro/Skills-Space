import assert from "node:assert/strict";
import { test } from "node:test";
import { notificationError } from "./notification-message.ts";

test("recognized failures use actionable localized summaries", () => {
  assert.equal(notificationError("Error: connect ECONNREFUSED 127.0.0.1", true), "无法连接来源，请检查网络和地址后重试。");
  assert.equal(notificationError("Pi settings changed", false), "Pi settings changed elsewhere. Reload before retrying.");
  assert.equal(notificationError("Hermes settings changed. Reload before saving.", true), "Hermes 配置已变化，请重新读取后再保存。");
  assert.equal(notificationError("Cannot inspect Hermes skill settings. Check config.yaml.", true), "无法读取 Hermes 技能配置，请检查 config.yaml。");
});
test("unknown failures use the action context without exposing terminal diagnostics", () => {
  assert.equal(notificationError("\u001b[31mError: Could not prepare removal\u001b[0m\n at /private/source.ts:20", false, "Could not read uninstall targets. Refresh skills."), "Could not read uninstall targets. Refresh skills.");
});
test("empty or unclassified diagnostics do not leak raw output", () => {
  assert.equal(notificationError(" \n ", true), "操作未完成。");
  assert.equal(notificationError("x".repeat(300), false), "The operation did not finish.");
});

test("action boundaries supply a retry path without inventing an unknown cause", () => {
  assert.equal(notificationError("Unexpected native response: 17", true, "扩展包检查失败，请重新检查。"), "扩展包检查失败，请重新检查。");
  assert.equal(notificationError("Pi settings changed", false, "Check again"), "Pi settings changed elsewhere. Reload before retrying.");
});

test("partial results keep counts but never append unknown native diagnostics", () => {
 assert.equal(notificationError("已完成 1/2 项。Unexpected native response: 17",true,"调用方式未保存，请重新选择调用方式。"),"已完成 1/2 项。调用方式未保存，请重新选择调用方式。");
 assert.equal(notificationError("1/2 completed. Unexpected native response: 17",false,"Choose the mode again."),"1/2 completed. Choose the mode again.");
});
