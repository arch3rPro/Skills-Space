import assert from "node:assert/strict";
import test from "node:test";
import { skillMarkdownBody, skillDocumentUrl, diffLines, shortSkillVersion } from "./skill-document.ts";

test("preview omits leading metadata while preserving Markdown body and original source", () => {
  for (const newline of ["\n", "\r\n"]) {
    const body = `# Example${newline}${newline}---${newline}Paragraph`;
    const source = `\uFEFF---${newline}name: example${newline}description: Example${newline}---${newline}${body}`;
    assert.equal(skillMarkdownBody(source), body);
    assert.ok(source.includes("name: example"));
  }
  assert.equal(skillMarkdownBody("# No metadata\nBody"), "# No metadata\nBody");
  assert.equal(skillMarkdownBody("---\nUnclosed metadata"), "---\nUnclosed metadata");
});

test("document URLs permit web links without granting local or executable navigation", () => {
  assert.equal(skillDocumentUrl("https://example.com/guide?q=one#two"), "https://example.com/guide?q=one#two");
  assert.equal(skillDocumentUrl("http://localhost:3000/docs"), "http://localhost:3000/docs");
  for (const value of [undefined, "", "javascript:alert(1)", "data:text/html,hello", "file:///etc/passwd", "tauri://localhost", "//example.com", "./scripts/run.sh", "https://user:password@example.com", "https://"]) {
    assert.equal(skillDocumentUrl(value), undefined);
  }
});

test("unified diff keeps independent old/new line numbers across multiple hunks",()=>{
 const rows=diffLines("@@ -2,2 +2,2 @@\n same\n-old\n+new\n@@ -10,0 +11,1 @@\n+added");
 assert.deepEqual(rows.filter(row=>row.kind!=="hunk").map(row=>[row.oldLine,row.newLine]),[[2,2],[3,null],[null,3],[null,11]]);
 assert.equal(shortSkillVersion("759f1e56d0d2fdd3819d2a53b81e72767c08d914"),"759f1e5");
 assert.equal(shortSkillVersion("1234567890abcdef1234567890abcdef"),"1234567");
 assert.equal(shortSkillVersion("1.3.0"),"1.3.0");
});
