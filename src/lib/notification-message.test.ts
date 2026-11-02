import assert from "node:assert/strict";
import { test } from "node:test";
import { notificationError } from "./notification-message.ts";

test("recognized guidance takes precedence over the action fallback", () => {
  assert.equal(notificationError("Pi settings changed", false, "Check again"), "Pi settings changed elsewhere. Reload before retrying.");
  assert.equal(notificationError("Hermes settings changed. Reload before saving.", true), "Hermes 配置已变化，请重新读取后再保存。");
  assert.equal(notificationError("Cannot inspect Hermes skill settings. Check config.yaml.", true), "无法读取 Hermes 技能配置，请检查 config.yaml。");
});
test("unclassified diagnostics use a scoped fallback or a localized generic message", () => {
  assert.equal(notificationError("\u001b[31mError: Could not prepare removal\u001b[0m\n at /private/source.ts:20", false, "Could not read uninstall targets. Refresh skills."), "Could not read uninstall targets. Refresh skills.");
  assert.equal(notificationError("Unexpected native response: 17", true, "扩展包检查失败，请重新检查。"), "扩展包检查失败，请重新检查。");
  assert.equal(notificationError(" \n ", true), "操作未完成。");
  assert.equal(notificationError("x".repeat(300), false), "The operation did not finish.");
});
test("partial results retain completed counts without exposing unknown diagnostics", () => {
  assert.equal(notificationError("已完成 1/2 项。Unexpected native response: 17",true,"调用方式未保存，请重新选择调用方式。"),"已完成 1/2 项。调用方式未保存，请重新选择调用方式。");
  assert.equal(notificationError("1/2 completed. Unexpected native response: 17",false,"Choose the mode again."),"1/2 completed. Choose the mode again.");
});
