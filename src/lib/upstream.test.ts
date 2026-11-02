import { groupProjectResults } from "./project-operation-results.ts";
import { groupPaths, recheckSourceRemoval, retryableSkills } from "./operation-results.ts";
import type { DependencyResult, RestoreResult, Operation, OperationResult } from "./upstream.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { inspectInstalledSkill, skillReinstallSource, isNativeSkillForAgent, skillCollection, agentSkillOrigin, skillSourceKind, skillSourceUrl, ambiguousNames, skillInstallationPaths, sameNameNotice, removalTargetAgents, canRemove, canUpdate, availableUpdateSkills, remainingOperationSkills, detectedSkillAgents, installedSkillCounts, displayHomePath, expandHomePath, visibleSkills, type Agent, type Inventory, type InstalledSkill } from "./upstream.ts";

const inventory: Inventory = {
  version: "1.7.2", agents: [
    { id: "codex", name: "Codex", detected: true, installationStatus: "confirmed", installationEvidence: "/bin/codex", sharedDirectory: true, path: "/codex", directoryExists: true, additionalPaths: [] },
    { id: "claude-code", name: "Claude Code", detected: true, installationStatus: "confirmed", installationEvidence: "/bin/claude", sharedDirectory: false, path: "/claude", directoryExists: true, additionalPaths: [] },
  ], warnings: [],
  skills: [
    { name: "review", path: "/codex/review", agents: ["codex"], source: "one/repo", sourceUrl: null, description: "Review code" },
    { name: "review", path: "/claude/review", agents: ["claude-code"], source: "two/repo", sourceUrl: null, description: "Different content" },
    { name: "pdf", path: "/shared/pdf", agents: ["codex", "claude-code"], source: null, sourceUrl: null, description: "Read documents" },
  ],
};
test("Agent inventory contains only that Agent's actual records", () => {
  assert.deepEqual(visibleSkills(inventory, "", "codex").map((skill) => skill.path), ["/codex/review", "/shared/pdf"]);
});
test("source search and Agent filter apply together without merging same-name skills", () => {
  assert.equal(visibleSkills(inventory, "two/repo", "codex").length, 0);
  assert.equal(visibleSkills(inventory, "review", "").length, 2);
});
test("ambiguous names cannot be mistaken for uniquely actionable installations", () => {
  assert.deepEqual([...ambiguousNames(inventory.skills)], ["review"]);
});
test("same-name records can be removed only with an unambiguous Agent selection", () => {
  assert.equal(canRemove(inventory.skills, ["review"], ["codex"]), true);
  assert.equal(canRemove(inventory.skills, ["review"], []), false);
  assert.equal(canRemove([...inventory.skills, { ...inventory.skills[0], path: "/other/review" }], ["review"], ["codex"]), false);
});

test("bulk removal may contain skills installed in different Agents", () => {
  assert.equal(canRemove(inventory.skills, ["review", "pdf"], ["codex", "claude-code"]), true);
  assert.equal(canRemove(inventory.skills, ["review"], ["not-installed"]), false);
});

test("shared inventory does not imply an undetected Agent is installed", () => {
  const agents: Agent[] = [
    { id: "codex", name: "Codex", detected: true, installationStatus: "confirmed", installationEvidence: "/bin/codex", sharedDirectory: true, path: "/shared", directoryExists: true, additionalPaths: [] },
    { id: "cursor", name: "Cursor", detected: false, installationStatus: "notFound", installationEvidence: null, sharedDirectory: true, path: "/shared", directoryExists: true, additionalPaths: [] },
  ];
  const skill = { ...inventory.skills[2], agents: ["codex", "cursor"] };
  assert.deepEqual(detectedSkillAgents(skill, agents).map((agent) => agent.id), ["codex"]);
  assert.equal(skill.agents.length, 2, "physical inventory remains available for removal impact verification");
});

test("directory presentation hides the home name without changing execution paths or neighboring users", () => {
  const home = "/Users/example";
  assert.equal(displayHomePath(`${home}/.agents/skills`, home), "~/.agents/skills");
  assert.equal(displayHomePath(home, home + "/"), "~");
  assert.equal(displayHomePath("/Users/example-other/skills", home), "/Users/example-other/skills");
  assert.equal(displayHomePath(`Failed: ${home}/skills\n${home}/project`, home), "Failed: ~/skills\n~/project");
  assert.equal(expandHomePath("~/skills", home), `${home}/skills`);
  assert.equal(expandHomePath("owner/repo", home), "owner/repo");
  assert.equal(displayHomePath("C:\\Users\\example\\skills", "C:\\Users\\example\\"), "~\\skills");
});

test("copies with one recorded source can update together without merging installation paths", () => {
  const copies = inventory.skills.slice(0, 2).map((skill) => ({ ...skill, source: "one/repo", updateable: true }));
  assert.equal(canUpdate(copies, ["review"]), true);
  assert.equal(ambiguousNames(copies).has("review"), true, "physical identity remains distinct");
  assert.equal(canUpdate([{ ...copies[0], source: null }, copies[1]], ["review"]), false);
  assert.equal(canUpdate([copies[0], { ...copies[1], source: "other/repo" }], ["review"]), false);
  assert.equal(canUpdate([{ ...copies[0], updateable: false }], ["review"]), false);
  assert.equal(canUpdate(copies, ["missing"]), false);
});

test("manual recovery selects only incomplete items and never repeats verified items", () => {
  assert.deepEqual(remainingOperationSkills({ inventory: null, logs: "", items: [
    { skill: "complete", status: "complete", message: "verified" },
    { skill: "failed", status: "failed", message: "failed" },
    { skill: "unknown", status: "uncertain", message: "unknown" },
    { skill: "failed", status: "failed", message: "failed again" },
  ] }), ["failed", "unknown"]);
});

test("Eve removal reviews all subagent copies while other Agent ambiguity remains blocked", () => {
  const copies: InstalledSkill[] = ["root", "alpha", "beta"].map((slot) => ({ name: "review", path: `/eve/${slot}/review`, agents: ["eve"], source: null, sourceUrl: null, description: "Eve copy" }));
  assert.equal(canRemove(copies, ["review"], ["eve"]), true);
  assert.equal(canRemove(copies.map((s) => ({ ...s, agents: ["codex"] })), ["review"], ["codex"]), false);
  assert.equal(canRemove([{ ...copies[0], issue: "Metadata inspection unavailable" }], ["review"], ["eve"]), true);
});

test("source icons honor recorded kind instead of treating every website as Git", () => {
  const skill = inventory.skills[0];
  assert.equal(skillSourceKind({...skill, sourceType:"download", sourceUrl:"https://example.com/SKILL.md"}), "download");
  assert.equal(skillSourceKind({...skill, sourceType:"well-known", sourceUrl:"https://example.com"}), "well-known");
  assert.equal(skillSourceKind({...skill, sourceType:"local", source:"/tmp/skill"}), "local");
  assert.equal(skillSourceKind({...skill, sourceType:"node_modules"}), "node_modules");
  assert.equal(skillSourceKind({...skill, source:null}), "unknown");
});
test("source links accept recorded websites and GitHub shorthand but reject executable and credential URLs", () => {
  const skill = {...inventory.skills[0], source:null};
  assert.equal(skillSourceUrl({...skill, sourceUrl:"https://example.com/skills"}), "https://example.com/skills");
  assert.equal(skillSourceUrl({...skill, sourceUrl:"javascript:alert(1)"}), null);
  assert.equal(skillSourceUrl({...skill, sourceUrl:"file:///tmp/skill"}), null);
  assert.equal(skillSourceUrl({...skill, sourceUrl:"https://secret@example.com"}), null);
  assert.equal(skillSourceUrl({...skill, source:"owner/repo", sourceType:"github"}), "https://github.com/owner/repo");
});

 test("skill icons include confirmed universal and dedicated Agents, excluding configuration-only targets", () => {
  const confirmed: Agent = {id:"codex", name:"Codex", detected:false, installationStatus:"confirmed", installationEvidence:"/bin/codex", sharedDirectory:true, path:"/shared", directoryExists:true, additionalPaths:[]};
  const configuration: Agent = {...confirmed,id:"cursor",installationStatus:"configurationOnly",detected:true,sharedDirectory:false};
  const dedicated: Agent = {...confirmed,id:"claude-code",sharedDirectory:false};
  const skill: InstalledSkill = {...inventory.skills[2],shared:true,agents:["codex","cursor","claude-code"]};
  assert.deepEqual(detectedSkillAgents(skill,[confirmed,configuration,dedicated]).map(a=>a.id),["codex","claude-code"]);
  assert.equal(visibleSkills({...inventory,agents:[confirmed,configuration,dedicated],skills:[skill]},"","codex").length,1);
  assert.deepEqual(skill.agents,["codex","cursor","claude-code"],"all physical associations remain for operation impact");
 });

test("unconfirmed shared-directory Agents have neither visible skills nor installed counts", () => {
  const confirmed = inventory.agents[0];
  const configuration: Agent = {...confirmed, id:"github-copilot", detected:true, installationStatus:"configurationOnly", installationEvidence:null};
  const absent: Agent = {...configuration,id:"cursor",detected:false,installationStatus:"notFound"};
  const skill: InstalledSkill = {...inventory.skills[2],shared:true,agents:[confirmed.id,configuration.id,absent.id]};
  const snapshot: Inventory = {...inventory,agents:[confirmed,configuration,absent],skills:[skill]};
  assert.deepEqual(visibleSkills(snapshot,"",configuration.id),[]);
  assert.deepEqual(visibleSkills(snapshot,"",absent.id),[]);
  assert.deepEqual(visibleSkills(snapshot,"","unknown"),[]);
  assert.deepEqual(visibleSkills(snapshot,"",confirmed.id),[skill]);
  assert.deepEqual([...installedSkillCounts(snapshot)],[[confirmed.id,1]]);
  assert.deepEqual(snapshot.skills[0].agents,["codex","github-copilot","cursor"],"unfiltered physical associations remain for removal planning");
  assert.deepEqual(visibleSkills(snapshot,"",""),[skill],"the scope-wide inventory remains visible");
  const verified = {...snapshot,agents:[confirmed,{...configuration,installationStatus:"confirmed" as const,installationEvidence:"/bin/copilot"},absent]};
  assert.deepEqual(visibleSkills(verified,"",configuration.id),[skill],"refreshing with actual installation evidence reveals its skills");
});

test("one saved Agent order survives scope subsets, search, and new Agent definitions", async () => {
  const {orderAgents, moveAgent} = await import("./upstream.ts");
  const base = inventory.agents[0];
  const agents: Agent[] = [base,{...base,id:"pi",name:"Pi"},{...base,id:"hermes-agent",name:"Hermes"}];
  const moved = moveAgent(agents, [], "pi", "codex");
  assert.deepEqual(orderAgents(agents,moved).map(a=>a.id),["pi","codex","hermes-agent"]);
  assert.deepEqual(orderAgents(agents.filter(a=>a.id!=="pi"),moved).map(a=>a.id),["codex","hermes-agent"]);
  const withProject = ["eve",...moved];
  const again = moveAgent(agents,withProject,"hermes-agent","pi");
  assert.equal(again[0],"eve","scope-only Agent positions remain in preferences");
  assert.deepEqual(orderAgents(agents,again).map(a=>a.id),["hermes-agent","pi","codex"]);
  assert.deepEqual(orderAgents([...agents,{...base,id:"future-agent"}],again).map(a=>a.id),["hermes-agent","pi","codex","future-agent"]);
  assert.equal(agents[0].id,"codex","sorting never mutates native inventory");
});

test("Hermes category and external skills are visible but only CLI target associations are removable", () => {
  const skill: InstalledSkill = { name: "hermes-demo", description: "Bundled", path: "/hermes/category/demo", agents: ["hermes-agent"], source: null, sourceUrl: null, hermesOrigin: "builtin", cliManaged: false, cliAgents: [], updateable: false };
  assert.equal(canRemove([skill], [skill.name], ["hermes-agent"]), false);
  assert.equal(canUpdate([skill], [skill.name]), false);
  const shared = { ...skill, path: "/shared/demo", agents: ["hermes-agent", "codex"], hermesOrigin: "external" as const, cliAgents: ["codex"], cliManaged: true };
  assert.deepEqual(removalTargetAgents(shared, ""), ["codex"]);
  assert.equal(canRemove([shared], [skill.name], removalTargetAgents(shared, "")), true);
  assert.equal(canRemove([shared], [skill.name], ["codex"]), true);
  assert.equal(canRemove([shared], [skill.name], ["hermes-agent"]), false);
  const hermesCopy = { ...shared, path: "/hermes/demo", agents: ["hermes-agent"], hermesOrigin: "local" as const, cliAgents: ["hermes-agent"] };
  assert.equal(canRemove([shared, hermesCopy], [skill.name], ["codex", "hermes-agent"]), true);
  assert.equal(canRemove([shared, hermesCopy], [skill.name], ["hermes-agent"]), false);
});


test("macOS canonical home aliases display as a whole and expand to usable source paths", () => {
  const home = "/var/folders/fixture/home";
  assert.equal(displayHomePath("/private" + home + "/.hermes/skills/demo", home), "~/.hermes/skills/demo");
  assert.equal(expandHomePath(displayHomePath("/private" + home + "/.hermes/skills/demo", home), home), home + "/.hermes/skills/demo");
  assert.equal(displayHomePath(home + "/skills", "/private" + home), "~/skills");
  assert.equal(displayHomePath("/private" + home + "-other/skills", home), "/private" + home + "-other/skills");
});


test("inventory sections separate native origins without treating unknown sources as bundled", () => {
  const base:InstalledSkill={name:"sample",path:"/skills/sample",agents:["pi"],source:null,sourceUrl:null,description:""};
  const state={path:base.path,file:base.path+"/SKILL.md",rulePath:base.path+"/SKILL.md",name:base.name,description:"",enabled:true,canToggle:true,reason:null,blockingRules:[],settingsPath:"/settings.json",scope:"global" as const,packageIndex:null,packageSource:null,origin:"directory",manualOnly:false,cliAddressable:false};
  for(const origin of ["builtin","external","local"] as const){
    const skill={...base,hermesOrigin:origin};assert.equal(skillCollection(skill),"agent");assert.equal(agentSkillOrigin(skill),origin==="builtin"?"builtin":"directory");
    assert.equal(skillCollection({...skill,cliManaged:true}),"managed","recorded upstream installations keep their lifecycle");
  }
  assert.equal(skillCollection({...base,hermesOrigin:"local",cliAgents:["hermes-agent"]}),"managed","untracked standard Hermes targets retain upstream remove capability");
  assert.equal(skillCollection({...base,piState:state}),"agent");
  assert.equal(agentSkillOrigin({...base,piState:state}),"directory");
  const pkg={...base,piState:{...state,origin:"package",packageIndex:0,packageSource:"npm:example"}};
  assert.equal(skillCollection(pkg),"agent");assert.equal(agentSkillOrigin(pkg),"package");
  assert.equal(skillCollection({...base,piState:{...state,origin:"configured",cliAddressable:true}}),"agent");
  assert.equal(skillCollection({...base,piState:{...state,cliAddressable:true}}),"managed","standard shared CLI target is not a builtin");
  assert.equal(skillCollection({...pkg,cliManaged:true}),"managed","one recorded physical installation belongs to only one page");
  assert.equal(skillCollection(base),"managed");assert.equal(agentSkillOrigin(base),null);
  assert.equal(skillCollection({...base,sourceType:"download"}),"managed","upstream downloads need no source lock");
  const grouped={...inventory,skills:[base,pkg]};
  const visible=visibleSkills(grouped,"npm:example","");assert.deepEqual(visible,[pkg]);
  const managed=grouped.skills.filter(skill=>skillCollection(skill)==="managed"),native=grouped.skills.filter(skill=>skillCollection(skill)==="agent");
  assert.equal(managed.length+native.length,grouped.skills.length);assert.equal(managed.some(skill=>native.includes(skill)),false);
});


test("removal retry excludes completed and already-deleted paths even after command failure", () => {
  const operation: Operation = { target: { host: "local", scope: "global", projectPath: null }, action: "remove", source: null, skills: ["done", "gone", "left"], agents: ["pi"], copy: false, removalSource: "owner/repo" };
  const report = (outcome: "removed" | "retained") => ({ paths: [{ path: "/skills/demo", kind: "shared" as const, agents: ["pi"], selected: true, outcome }], lock: "removed" as const, unrelatedPreserved: true });
  const result: OperationResult = { inventory: { ...inventory, skills: [] }, logs: "", items: [
    { skill: "done", status: "complete", message: "", removal: report("removed") },
    { skill: "gone", status: "failed", message: "Command failed", removal: report("removed") },
    { skill: "left", status: "failed", message: "", removal: report("retained") },
  ] };
  assert.deepEqual(retryableSkills(result, operation), ["left"]);
  assert.deepEqual(retryableSkills({ ...result, inventory: null }, operation), []);
});

test("source retry ignores surviving native same-name skills without a removal report", () => {
  const operation: Operation = { target: { host: "local", scope: "global", projectPath: null }, action: "remove", source: null, skills: ["demo"], agents: ["pi"], copy: false, removalSource: "owner/repo" };
  const base: InstalledSkill = { name: "demo", path: "/pi/native/demo", agents: ["pi"], source: null, sourceUrl: null, description: "", cliManaged: false };
  const result: OperationResult = { inventory: { ...inventory, skills: [base] }, logs: "", items: [{ skill: "demo", status: "uncertain", message: "" }] };
  assert.deepEqual(retryableSkills(result, operation), []);
  assert.deepEqual(retryableSkills({ ...result, inventory: { ...inventory, skills: [{ ...base, path: "/shared/demo", cliManaged: true, source: "owner/repo" }] } }, operation), ["demo"]);
});

test("path summaries share directory prefixes while retaining every name and distinct outcome", () => {
  assert.deepEqual(groupPaths([
    { path: "/home/u/.agents/skills/a", state: "removed" },
    { path: "/home/u/.agents/skills/b", state: "removed" },
    { path: "/home/u/.agents/skills/a", state: "removed" },
    { path: "/home/u/.agents/skills/c", state: "retained" },
    { path: "/home/u/.hermes/skills/a", state: "removed" },
  ]), [
    { directory: "/home/u/.agents/skills/", state: "removed", names: ["a", "b"] },
    { directory: "/home/u/.agents/skills/", state: "retained", names: ["c"] },
    { directory: "/home/u/.hermes/skills/", state: "removed", names: ["a"] },
  ]);
});


test("source recheck keeps the project and source context and builds a fresh confirmation", async () => {
  const previous: Operation = { target: { host: "local", scope: "project", projectPath: "/project" }, action: "remove", source: null, skills: ["done", "left"], agents: ["pi"], copy: false, removalSource: "owner/repo" };
  const current: Inventory = { ...inventory, skills: [{ name: "left", path: "/project/.agents/skills/left", agents: ["pi"], source: "owner/repo", sourceUrl: null, description: "", cliManaged: true }] };
  const fresh: Operation = { ...previous, skills: ["left"] };
  const events: string[] = [];
  const checked = await recheckSourceRemoval(previous, ["left"], {
    inventory: async target => { assert.deepEqual(target, previous.target); events.push("inventory"); return current; },
    sourcePlan: async (target, name) => { assert.deepEqual(target, previous.target); assert.equal(name, "left"); events.push("source-plan"); return fresh; },
  });
  assert.deepEqual(events, ["inventory", "source-plan"]);
  assert.equal(checked.operation, fresh);
  await assert.rejects(recheckSourceRemoval(previous, ["left"], { inventory: async () => current, sourcePlan: async () => ({ ...fresh, removalSource: "other/repo" }) }), /source changed/);
});

test("source recheck distinguishes removed installs, lock-only entries and actual inspection errors", async () => {
  const previous: Operation = { target: { host: "local", scope: "global", projectPath: null }, action: "remove", source: null, skills: ["left"], agents: ["pi"], copy: false, removalSource: "owner/repo" };
  const empty: Inventory = { ...inventory, skills: [] };
  const removed = await recheckSourceRemoval(previous, ["left"], { inventory: async () => empty, sourcePlan: async () => { throw new Error("This skill has no upstream source record."); } });
  assert.equal(removed.operation, null);
  const lockOnly = await recheckSourceRemoval(previous, ["left"], { inventory: async () => empty, sourcePlan: async () => previous });
  assert.equal(lockOnly.operation, previous);
  await assert.rejects(recheckSourceRemoval(previous, ["left"], { inventory: async () => empty, sourcePlan: async () => { throw new Error("Permission denied"); } }), /Permission denied/);
});


test("source recheck does not claim removal when untracked CLI paths remain", async () => {
  const operation: Operation = { target: { host: "local", scope: "global", projectPath: null }, action: "remove", source: null, skills: ["left"], agents: ["pi"], copy: false, removalSource: "owner/repo" };
  const current: Inventory = { ...inventory, skills: [{ name: "left", path: "/shared/left", agents: ["pi"], cliAgents: ["pi"], cliManaged: false, source: null, sourceUrl: null, description: "" }] };
  await assert.rejects(recheckSourceRemoval(operation, ["left"], { inventory: async () => current, sourcePlan: async () => { throw new Error("This skill has no upstream source record."); } }), /CLI paths remain/);
});


test("project results count each skill once and keep partial target failures visible", () => {
  const row: DependencyResult["items"][number] = { skill: "demo", agent: "codex", path: "/codex/demo", action: "install", status: "complete", after: {path:"/codex/demo",kind:"directory",hash:null,linkTarget:null}, changed: true, contentMatches: true, relationshipMatches: true, lockMatches: true };
  const other = { ...row, agent:"pi", path:"/pi/demo" };
  assert.equal(groupProjectResults([row, other]).length, 1);
  const groups = groupProjectResults([row, {...other, status:"failed"}]);
  assert.equal(groups[0].status, "failed");
  assert.equal(groups[0].items.length, 2);
  assert.equal(groups[0].items[0], row);
  assert.equal(row.status, "complete");
});

test("project results separate cleanup from installation and never hide uncertainty", () => {
  const base: DependencyResult["items"][number] = { skill:"demo",agent:"codex",path:"/demo",action:"install",status:"complete",after:{path:"/demo",kind:"directory",hash:null,linkTarget:null},changed:true,contentMatches:true,relationshipMatches:true,lockMatches:true };
  const groups = groupProjectResults([base,{...base,action:"remove",status:"uncertain"}]);
  assert.deepEqual(groups.map(group=>[group.action,group.status]), [["install","complete"],["remove","uncertain"]]);
  assert.equal(groupProjectResults([{...base,status:"failed"},{...base,status:"uncertain"}])[0].status,"failed");
  const restored: RestoreResult["items"][number] = {skill:"restored",path:"/restored",status:"uncertain",changed:false,afterKind:"missing",contentMatches:false,lockMatches:false,lockChanged:false};
  assert.equal(groupProjectResults([restored])[0].status,"uncertain");
  assert.deepEqual(groupProjectResults([]),[]);
});


test("Agent sync retains the recorded installation source and never falls back to installed content", () => {
  const skill = inventory.skills[0];
  assert.equal(skillReinstallSource({ ...skill, installSource: "https://github.com/one/repo/tree/main/skills" }), "https://github.com/one/repo/tree/main/skills");
  assert.equal(skillReinstallSource({ ...skill, sourceUrl: "https://github.com/one/repo.git" }), "https://github.com/one/repo.git");
  assert.equal(skillReinstallSource({ ...skill, sourceType: "well-known", installSource: "https://skills.example/.well-known/skills/index.json" }), "https://skills.example/.well-known/skills/index.json");
  assert.equal(skillReinstallSource({ ...skill, sourceType: "well-known", installSource: null }), null, "a repository fallback is not a provider index");
  assert.equal(skillReinstallSource({ ...skill, source: null, sourceUrl: null }), null, "the installed path must not become the new update source");
});

test("Agent sync locks inspection to one exact skill, preserving verification and session identity", () => {
  const skill = { name: "chosen", path: "/repo/skills/chosen", description: "", content: "", internal: true, downloadUrl: null, fileCount: null, pluginName: null, selectionFingerprint: "selection-hash", fingerprint: "content-hash" };
  const inspection = { sessionId: "session", source: "owner/repo", provider: false, skillFilter: null, warnings: ["notice"], skills: [skill, { ...skill, name: "other" }] };
  const selected = inspectInstalledSkill(inspection, "chosen");
  assert.deepEqual(selected?.skills, [skill]);
  assert.equal(selected?.skills[0], skill);
  assert.equal(selected?.sessionId, "session");
  assert.equal(selected?.skillFilter, "chosen");
  assert.equal(inspection.skills.length, 2);
  assert.equal(inspectInstalledSkill(inspection, "missing"), null);
  assert.equal(inspectInstalledSkill(inspection, "*"), null);
  assert.equal(inspectInstalledSkill({ ...inspection, skills: [skill, { ...skill, path: "/repo/other/chosen" }] }, "chosen"), null);
});

test("same-name paths distinguish Pi precedence, disabled copies and unrelated Agent directories", () => {
  const pi = (path: string, enabled: boolean, reason: "shadowed" | null): InstalledSkill => ({
    name: "browser", path, agents: ["pi"], source: null, sourceUrl: null, description: "",
    piState: { path, file: `${path}/SKILL.md`, rulePath: `${path}/SKILL.md`, name: "browser", description: "", enabled, reason, canToggle: !reason, blockingRules: [], settingsPath: "/settings.json", scope: "global", packageIndex: null, packageSource: null, origin: "directory", manualOnly: true, cliAddressable: false },
  });
  const native = pi("/pi/browser", true, null);
  const shared = { ...pi("/shared/browser", true, "shadowed"), cliManaged: true };
  const disabled = pi("/extra/browser", false, null);
  const other = { ...inventory.skills[0], name: "browser" };
  const records = [shared, disabled, native, other];
  assert.deepEqual(skillInstallationPaths(records, "browser"), [
    {path: shared.path, state: "piShadowed"}, {path: disabled.path, state: "piDisabled"},
    {path: native.path, state: "piActive"}, {path: other.path, state: "directory"},
  ]);
  assert.match(sameNameNotice(records, "browser", true), /Pi.*同名覆盖/);
  assert.match(sameNameNotice(records, "browser", false), /overlap in Pi/);
  assert.match(sameNameNotice([native, disabled, other], "browser", true), /多个同名目录/);
  assert.deepEqual(skillInstallationPaths([native, native], "browser"), [{path: native.path, state: "piActive"}]);
  assert.deepEqual(skillInstallationPaths([native, pi("/another/browser", true, null)], "browser").map(item => item.state), ["piUnknown", "piUnknown"]);
  assert.deepEqual(skillInstallationPaths(records, "missing"), []);
});

test("bulk selection affects eligible visible items while inversion preserves outside selections", async () => {
  const {selectVisible} = await import("./selection.ts");
  assert.deepEqual(selectVisible(["outside","one"],["one","two","two"]),["outside","one","two"]);
  assert.deepEqual(selectVisible(["outside","one"],["one","two"],true),["outside","two"]);
  assert.deepEqual(selectVisible(["one","two"],["one","two"],true),[]);
  assert.deepEqual(selectVisible([],[],true),[]);
});

test("enhanced groups sort independently and preserve all saved IDs", async () => {
  const {agentSupportGroup, agentEnhancement, moveAgentWithinSupport} = await import("./upstream.ts");
  const agents = ["pi","codex","deepseek-harness","claude-code","hermes-agent"].map(id=>({...inventory.agents[0],id,name:id}));
  const saved = ["pi","codex","deepseek-harness","claude-code","hermes-agent","unknown"];
  assert.equal(agentSupportGroup("deepseek-harness"),"enhanced");
  assert.equal(agentSupportGroup("codex"),"enhanced");
  assert.equal(agentEnhancement("hermes-agent").settings,"hermes");
  const result = moveAgentWithinSupport(agents,saved,"hermes-agent","pi");
  assert.deepEqual(result,["hermes-agent","pi","codex","claude-code","deepseek-harness","unknown"]);
  assert.deepEqual(moveAgentWithinSupport(agents,result,"pi","claude-code"),result);
  // Existing serialized preferences need no migration and retain group order after reload.
  const restored: string[] = JSON.parse(JSON.stringify(result));
  assert.deepEqual(restored.filter(id=>agentSupportGroup(id)==="enhanced"),["hermes-agent","pi","codex","deepseek-harness"]);
});


test("CLI managed ownership never grants native Agent management, including conflicting inspection metadata", () => {
  const base = {...inventory.skills[0], cliManaged: true};
  const managed: InstalledSkill = {...base, hermesOrigin: "external", piState: {path:base.path,file:`${base.path}/SKILL.md`,rulePath:`${base.path}/SKILL.md`,name:base.name,description:"fixture",enabled:false,canToggle:true,reason:null,blockingRules:[],settingsPath:"/settings.json",scope:"global",packageIndex:null,packageSource:"npm:native-only",origin:"configured",manualOnly:true,cliAddressable:false,canTrash:true,canSetVisibility:true},dshState:{file:`${base.path}/SKILL.md`,source:"user-dsh",modelInvocable:false,userInvocable:false,shadowed:true,cliAddressable:false,configured:false,reason:null,canSetInvocation:true,canTrash:true}};
  for (const agent of ["pi", "hermes-agent", "deepseek-harness"]) assert.equal(isNativeSkillForAgent(managed, agent), false);
  assert.equal(skillCollection(managed), "managed");
  const native = {...managed, cliManaged:false};
  for (const agent of ["pi", "hermes-agent", "deepseek-harness"]) assert.equal(isNativeSkillForAgent(native, agent), true);
  assert.equal(isNativeSkillForAgent(native, "codex"), false);
  const records=[managed,{...managed,path:"/another/copy"}];
  assert.ok(skillInstallationPaths(records,managed.name,null).every(item=>item.state==="directory"));
  assert.match(sameNameNotice(records,managed.name,true,"codex"), /多个同名目录/);
  assert.doesNotMatch(sameNameNotice(records,managed.name,false,null), /Pi/);
  assert.deepEqual(visibleSkills({...inventory,skills:[managed]}, "npm:native-only", ""),[managed]);
});


test("update review includes only confirmed actionable changes using full revisions", () => {
  const names = ["available", "current", "unknown", "modified", "removed", "missing", "same", "collision"];
  const skills = names.map(name => ({ ...inventory.skills[0], name, source:"one/repo", updateable:true }));
  const statuses = names.filter(name => name !== "missing").map(name => ({ skill:name, message:"", status: name === "current" || name === "unknown" || name === "removed" ? name : "available", localState: name === "modified" ? "modified" : "clean", currentRevision: "1234567"+"a".repeat(33), latestRevision: name === "same" ? "1234567"+"a".repeat(33) : "1234567"+"b".repeat(33) } satisfies import("./upstream.ts").UpdateStatus));
  assert.deepEqual(availableUpdateSkills(skills, [...names, "available"], statuses), ["available", "modified", "collision"]);
  assert.deepEqual(availableUpdateSkills(skills, names, []), []);
  assert.deepEqual(availableUpdateSkills(skills.map(skill => ({...skill, updateable:false})), names, statuses), []);
});

test('local distributions do not block their original source update; independent local copies remain actionable', () => {
  const original = { name: 'shared', path: '/source', agents: ['codex'], source: 'owner/repo', sourceUrl: null, description: '', cliManaged: true, updateable: true };
  const copy = { ...original, path: '/copy', agents: ['claude-code'], source: '/source', sourceType: 'local-sync', cliManaged: false };
  assert.equal(canUpdate([original, copy], ['shared']), true);
  const native = { ...original, cliManaged: false, source: null, updateable: false };
  assert.equal(canUpdate([native, copy], ['shared']), true);
});

test("legacy fx directories stay native and are never CLI removal targets", async()=>{
 const {skillCollection,isNativeSkillForAgent,removalTargetAgents}=await import("./upstream.ts");
 const legacy:InstalledSkill={name:"legacy",path:"/home/.fx/skills/legacy",agents:["fx"],cliAgents:[],source:null,sourceUrl:null,description:""};
 assert.equal(skillCollection(legacy),"agent");assert.equal(isNativeSkillForAgent(legacy,"fx"),true);assert.deepEqual(removalTargetAgents(legacy,"fx"),[]);
 const current={...legacy,path:"/home/.agents/skills/legacy",cliAgents:["fx"]};assert.equal(skillCollection(current),"managed");assert.deepEqual(removalTargetAgents(current,"fx"),["fx"]);
});

test('managed filters use actual Agent observations and preserve unknown enablement', async () => {
  const {managedSkillEnabled,filterManagedSkills}=await import('./managed-skill-filters.ts');
  const skill=(enabled:boolean|null):InstalledSkill=>({name:'managed',path:'/managed',agents:['codex'],source:'owner/repo',sourceUrl:null,description:'',codexState:{documentPath:'/managed/SKILL.md',installationPath:'/managed',origin:'standalone',runtimeScope:'user',inScope:true,enabled,pluginId:null,canToggle:true,needsConfirmation:false,toggleScope:'user',lifecycleOwner:'skills-cli'}});
  const on=skill(true),off={...skill(false),name:'off'},unknown={...skill(null),name:'unknown'};
  assert.equal(managedSkillEnabled(on,'codex'),true);assert.equal(managedSkillEnabled(off,'codex'),false);assert.equal(managedSkillEnabled(unknown,'codex'),null);
  assert.equal(managedSkillEnabled(on,'pi'),null,'another Agent observation cannot be inferred');
  assert.deepEqual(filterManagedSkills([on,off,unknown],'all','enabled','codex'),[on]);
  assert.deepEqual(filterManagedSkills([on,off,unknown],'all','disabled','codex'),[off]);
  assert.deepEqual(filterManagedSkills([on,off,unknown],'all','all','codex'),[on,off,unknown]);
  assert.equal(managedSkillEnabled({...on,agents:['claude-code']},'claude-code'),null,'installed files do not prove unsupported Agent enablement');
});

test('managed filters aggregate all Agents without converting incomplete observations to disabled', async () => {
  const {managedSkillEnabled}=await import('./managed-skill-filters.ts');
  const skill=(enabled:boolean):InstalledSkill=>({name:'managed',path:'/managed',agents:['pi'],source:null,sourceUrl:null,description:'',piState:{path:'/managed',file:'/managed/SKILL.md',rulePath:'/managed/SKILL.md',name:'managed',description:'',enabled,canToggle:true,reason:null,blockingRules:[],settingsPath:'/settings.json',scope:'global',packageIndex:null,packageSource:null,origin:'directory',manualOnly:false,cliAddressable:true}});
  const off=skill(false),on=skill(true);
  assert.equal(managedSkillEnabled(off,null),false);assert.equal(managedSkillEnabled(on,null),true);
  assert.equal(managedSkillEnabled({...off,agents:['pi','claude-code']},null),null);
  assert.equal(managedSkillEnabled({...on,agents:['pi','claude-code']},null),true);
  assert.equal(managedSkillEnabled({...off,agents:[]},null),null);
  const hermes:InstalledSkill={...off,agents:['hermes-agent'],hermesState:{path:'/managed',file:'/managed/SKILL.md',name:'managed',description:'',origin:'external',inScope:true,enabled:false,autoLoad:false,canToggle:true,canPreload:true,reason:null,loadName:null,documentRevision:'r',cliAddressable:true}};
  assert.equal(managedSkillEnabled(hermes,'hermes-agent'),false);
  assert(hermes.hermesState);
  assert.equal(managedSkillEnabled({...hermes,hermesState:{...hermes.hermesState,enabled:true}},'hermes-agent'),true);
});

test('managed filters combine recorded source kinds and state without inventing source options', async () => {
  const {filterManagedSkills,managedSkillSourceOptions}=await import('./managed-skill-filters.ts');
  const base:InstalledSkill={name:'managed',path:'/managed',agents:['claude-code'],source:null,sourceUrl:null,description:''};
  const entries=['github','gitlab','git','local','download','well-known','node_modules','other'].map(sourceType=>({...base,name:sourceType,sourceType}));
  assert.deepEqual(managedSkillSourceOptions(entries,true).map(item=>item.value),['all','download','git','local','node_modules','unknown','well-known']);
  assert.deepEqual(filterManagedSkills(entries,'git','all',null).map(item=>item.name),['github','gitlab','git']);
  assert.deepEqual(filterManagedSkills(entries,'local','disabled',null),[],'unknown enablement is not a disabled skill');
  assert.deepEqual(managedSkillSourceOptions([],false),[{value:'all',label:'All sources'}]);
  assert.equal(managedSkillSourceOptions(entries,false).find(item=>item.value==='git')?.label,'Git repository');
});

// Store discovery uses the same exact skill identity as the original CLI filter.
import { compactInstalls, marketplaceMetric, marketplaceMetricParts, marketplaceChange, isWebsiteSource, marketplaceSourceUrl, createMarketplaceSession, createDescriptionLoader, createMarkdownLoader, createResourceLoader, searchPageItems } from './marketplace.ts';
import type { MarketplaceSkill } from './upstream.ts';
const storeSkill: MarketplaceSkill = { id:'owner/repo/skill',skillId:'skill',name:'Skill',source:'owner/repo',installs:123456,previewable:true,description:null,change:12,isOfficial:false };
test('store installation counts are compact while exact and view-specific metrics remain available',()=>{
 assert.equal(compactInstalls(123456,true),'123.5K');assert.equal(compactInstalls(123456,false),'123.5K');
 assert.equal(compactInstalls(123456789,true),'123.5M');
 assert.equal(marketplaceMetric(storeSkill,'alltime',true),'安装量：123,456');
 assert.match(marketplaceMetric(storeSkill,'trending',true),/24h安装量/);
 assert.equal(marketplaceMetric(storeSkill,'hot',true),'1h安装量：123,456');
 assert.equal(marketplaceMetric({...storeSkill,change:-3},'hot',true),'1h安装量：123,456');
 assert.equal(marketplaceChange(-3,true)?.description,'较昨日同时段减少 3');
 assert.doesNotMatch(marketplaceMetric({...storeSkill,change:null},'hot',true),/昨日/);
});
test('store website source identity is separate from repository installation eligibility',()=>{
 assert.equal(isWebsiteSource('uizze.sh'),true);assert.equal(isWebsiteSource('sub.example.com'),true);
 for(const source of ['owner/repo','https://example.com','localhost','-bad.com'])assert.equal(isWebsiteSource(source),false);
 assert.equal(marketplaceSourceUrl({...storeSkill,source:'uizze.sh',id:'uizze.sh/ui-taste',previewable:false}),'https://uizze.sh/');
 assert.equal(marketplaceSourceUrl({...storeSkill,previewable:false}),'https://github.com/owner/repo');
});
test('store source links retain repository identity and browsing sessions do not share state',()=>{
 assert.equal(marketplaceSourceUrl(storeSkill),'https://github.com/owner/repo');
 const a=createMarketplaceSession(),b=createMarketplaceSession();a.boards.set('alltime:1',{skills:[storeSkill],page:1,total:1,totalPages:1,stale:false,fetchedAt:1});
 assert.equal(b.boards.size,0);assert.equal(a.board,'alltime');assert.equal(a.page,1);
 a.documents.set(storeSkill.id,{description:'Actual website description',html:'<p>Complete website body</p>'});assert.equal(b.documents.size,0);assert.equal(a.documents.get(storeSkill.id)?.html,'<p>Complete website body</p>');
});

function descriptionDeferred() {
 let resolve!: (description: string | null) => void;
 const promise=new Promise<string|null>(done=>{resolve=done;});
 return {promise,resolve};
}
const flushDescriptions=()=>new Promise<void>(resolve=>setImmediate(resolve));
test('description subscriptions limit concurrency to three and deduplicate the same listing',async()=>{
 const cache=new Map<string,string>(),gates=new Map<string,ReturnType<typeof descriptionDeferred>>();
 const calls:string[]=[];let active=0,peak=0;
 const load=createDescriptionLoader(cache,id=>{calls.push(id);active++;peak=Math.max(peak,active);const gate=descriptionDeferred();gates.set(id,gate);return gate.promise.finally(()=>{active--;});});
 const a=load('a'),again=load('a'),b=load('b'),c=load('c'),d=load('d');
 assert.notEqual(a.promise,again.promise);
 await flushDescriptions();assert.deepEqual(calls,['a','b','c']);assert.equal(active,3);
 gates.get('a')!.resolve('Description A');assert.equal(await a.promise,'Description A');assert.equal(await again.promise,'Description A');
 await flushDescriptions();assert.deepEqual(calls,['a','b','c','d']);assert.equal(peak,3);
 for(const id of ['b','c','d'])gates.get(id)!.resolve(`Description ${id}`);
 assert.deepEqual(await Promise.all([b.promise,c.promise,d.promise]),['Description b','Description c','Description d']);
 assert.equal(active,0);assert.equal(await load('a').promise,'Description A');assert.equal(calls.length,4);
});
test('description cache preserves actual documents, caches confirmed absence, and does not overwrite a newer description',async()=>{
 const cache=new Map([['known','Actual document'],['absent','']]);let calls=0;
 const gate=descriptionDeferred();
 const load=createDescriptionLoader(cache,async id=>{calls++;return id==='late'?gate.promise:null;});
 const cached=load('known');cached.release();assert.equal(await cached.promise,'Actual document');
 assert.equal(await load('absent').promise,null);assert.equal(calls,0);
 assert.equal(await load('missing').promise,null);assert(cache.has('missing'));assert.equal(cache.get('missing'),'');
 assert.equal(await load('missing').promise,null);assert.equal(calls,1);
 const pending=load('late');await flushDescriptions();cache.set('late','Newer actual SKILL.md description');gate.resolve('Older website description');
 assert.equal(await pending.promise,'Newer actual SKILL.md description');assert.equal(cache.get('late'),'Newer actual SKILL.md description');
});
test('failed description reads remain retryable immediately and never become confirmed absence',async()=>{
 const cache=new Map<string,string>();let calls=0;
 const load=createDescriptionLoader(cache,async()=>{if(++calls===1)throw Error('temporary failure');return 'Recovered description';});
 assert.equal(await load('retry').promise.catch(()=>{assert(!cache.has('retry'));return load('retry').promise;}),'Recovered description');
 assert.equal(calls,2);assert.equal(cache.get('retry'),'Recovered description');
});
test('releasing queued description work removes it without fetching or caching an empty description',async()=>{
 const cache=new Map<string,string>(),gates=new Map<string,ReturnType<typeof descriptionDeferred>>(),calls:string[]=[];
 const load=createDescriptionLoader(cache,id=>{calls.push(id);const gate=descriptionDeferred();gates.set(id,gate);return gate.promise;});
 const active=['a','b','c'].map(id=>load(id));await flushDescriptions();
 const queued=load('cancelled');const rejected=assert.rejects(queued.promise,{name:'AbortError'});queued.release();queued.release();await rejected;
 const visible=load('visible');gates.get('a')!.resolve('A');await active[0].promise;await flushDescriptions();
 assert.deepEqual(calls,['a','b','c','visible']);assert(!cache.has('cancelled'));
 for(const id of ['b','c','visible'])gates.get(id)!.resolve(id);
 await Promise.all([active[1].promise,active[2].promise,visible.promise]);
 const retried=load('cancelled');await flushDescriptions();gates.get('cancelled')!.resolve('Actual description');
 assert.equal(await retried.promise,'Actual description');
});
test('one cancelled duplicate subscriber cannot cancel the remaining queued subscriber',async()=>{
 const cache=new Map<string,string>(),gates=new Map<string,ReturnType<typeof descriptionDeferred>>(),calls:string[]=[];
 const load=createDescriptionLoader(cache,id=>{calls.push(id);const gate=descriptionDeferred();gates.set(id,gate);return gate.promise;});
 const active=['a','b','c'].map(id=>load(id));await flushDescriptions();
 const removed=load('shared'),remaining=load('shared');const rejected=assert.rejects(removed.promise,{name:'AbortError'});removed.release();await rejected;
 gates.get('a')!.resolve('A');await active[0].promise;await flushDescriptions();assert.equal(calls.filter(id=>id==='shared').length,1);
 gates.get('shared')!.resolve('Shared description');assert.equal(await remaining.promise,'Shared description');
 for(const id of ['b','c'])gates.get(id)!.resolve(id);await Promise.all([active[1].promise,active[2].promise]);
});
test('a browsing session retains its concurrency budget across released subscribers and reentry',async()=>{
 const session=createMarketplaceSession(),gates=new Map<string,ReturnType<typeof descriptionDeferred>>(),calls:string[]=[];
 let active=0,peak=0;
 const load=session.descriptionLoader=createDescriptionLoader(session.descriptions,id=>{calls.push(id);active++;peak=Math.max(peak,active);const gate=descriptionDeferred();gates.set(id,gate);return gate.promise.finally(()=>{active--;});});
 const previous=['a','b','c'].map(id=>load(id));await flushDescriptions();
 const cancelled=previous.map(request=>assert.rejects(request.promise,{name:'AbortError'}));previous.forEach(request=>request.release());await Promise.all(cancelled);
 const reentered=session.descriptionLoader;assert.equal(reentered,load);
 const takeover=reentered('a'),d=reentered('d'),e=reentered('e');await flushDescriptions();
 assert.deepEqual(calls,['a','b','c']);assert(!session.descriptions.has('a'));
 gates.get('b')!.resolve('B');gates.get('c')!.resolve('C');await flushDescriptions();
 assert.deepEqual(calls,['a','b','c','d','e']);assert.equal(peak,3);
 gates.get('a')!.resolve('Actual A');gates.get('d')!.resolve('Actual D');gates.get('e')!.resolve('Actual E');
 assert.deepEqual(await Promise.all([takeover.promise,d.promise,e.promise]),['Actual A','Actual D','Actual E']);assert.equal(active,0);
 assert.equal(await reentered('a').promise,'Actual A');assert.equal(calls.filter(id=>id==='a').length,1);
});


test('raw Markdown requests coalesce per identity and cache the exact same bytes for preview and source', async()=>{
 const cache=new Map<string,string>(),gate=descriptionDeferred(),calls:string[]=[];
 const session=createMarketplaceSession();
 const load=session.markdownLoader=createMarkdownLoader(cache,id=>{calls.push(id);return gate.promise.then(value=>value!);});
 const a=load('owner/repo/skill'),b=load('owner/repo/skill');assert.equal(a,b);
 const content='---\r\nname: skill\r\n---\r\n# 原始文档\r\n\n```ts\nconst x = 1;\n```\n';gate.resolve(content);
 assert.deepEqual(await Promise.all([a,b]),[content,content]);assert.equal(cache.get('owner/repo/skill'),content);
 assert.equal(await session.markdownLoader('owner/repo/skill'),content);assert.deepEqual(calls,['owner/repo/skill']);
});
test('failed raw reads are not cached and can retry immediately without affecting another identity',async()=>{
 const cache=new Map<string,string>();let calls=0;
 const load=createMarkdownLoader(cache,async id=>{if(id==='other')return '# Other';if(++calls===1)throw Error('503');return '# Recovered';});
 const result=await load('failed').catch(()=>load('failed'));
 assert.equal(result,'# Recovered');assert.equal(calls,2);assert.equal(await load('other'),'# Other');
 assert.equal(cache.get('failed'),'# Recovered');assert.equal(cache.get('other'),'# Other');
});

test('search pagination preserves remote relevance for all 100 items and clamps empty and final pages',()=>{
 const items=Array.from({length:100},(_,n)=>({id:`skill-${n}`,installs:100-n}));
 const pages=Array.from({length:9},(_,n)=>searchPageItems(items,n+1));
 assert.deepEqual(pages.flatMap(page=>page.items),items);assert.equal(pages[0].items.length,12);assert.equal(pages[8].items.length,4);
 assert.equal(searchPageItems(items,99).page,9);assert.equal(searchPageItems(items,0).page,1);assert.deepEqual(searchPageItems([],5),{page:1,totalPages:1,items:[]});
 const session=createMarketplaceSession();session.searchPage={key:'query:owner',page:4};assert.equal(session.searchPage.page,4);assert.equal(session.page,1);
});
test('website document resource shares concurrent installation and introduction reads, with failure retry and complete paths intact',async()=>{
 const cache=new Map<string,{sourceUrl:string,html:string|null}>();let calls=0;
 const gate=descriptionDeferred();
 const load=createResourceLoader(cache,async id=>{calls++;if(calls===1)throw Error('temporary');return {sourceUrl:(await gate.promise)!,html:id};});
 await assert.rejects(load('site/skill'),/temporary/);assert(!cache.has('site/skill'));
 const intro=load('site/skill'),install=load('site/skill');assert.equal(intro,install);
 gate.resolve('https://uizze.sh/skills/ui-taste');const doc=await install;
 assert.equal(doc.sourceUrl,'https://uizze.sh/skills/ui-taste');assert.equal(await load('site/skill'),doc);assert.equal(calls,2);
});

test('metadata-required resource reads migrate old cache without losing it on failure and cache confirmed empty metadata',async()=>{
 const original={description:'Authored',html:'<p>Old complete body</p>',metadata:null as null|{topics:unknown[]}};
 const cache=new Map([['id',original]]);let calls=0;
 const load=createResourceLoader(cache,async()=>{if(++calls===1)throw Error('offline');return {...original,metadata:{topics:[]}};},value=>value.metadata!=null);
 await assert.rejects(load('id'),/offline/);assert.equal(cache.get('id'),original);
 const a=load('id'),b=load('id');assert.equal(a,b);const result=await a;
 assert.deepEqual(result.metadata,{topics:[]});assert.equal(await load('id'),result);assert.equal(calls,2);
});

test('period metrics retain the selected board unit and separate the exact count from hot growth',()=>{
 const skill={...storeSkill,installs:291,change:219};
 assert.deepEqual(marketplaceMetricParts(skill,'trending',true),{label:'24h安装量',value:'291'});
 assert.deepEqual(marketplaceMetricParts(skill,'hot',true),{label:'1h安装量',value:'291'});
 assert.deepEqual(marketplaceMetricParts(skill,'hot',false),{label:'1h Installs',value:'291'});
 assert.deepEqual(marketplaceMetricParts(skill,'trending',false),{label:'24h Installs',value:'291'});
 assert.equal(marketplaceMetric(skill,'hot',true),'1h安装量：291');
 for(const board of ['alltime','search'] as const){assert.equal(marketplaceMetric(skill,board,true),'安装量：291');assert.equal(marketplaceMetric(skill,board,false),'Installs: 291');}
 assert.equal(marketplaceMetric(skill,'trending',true),'24h安装量：291');
});
test('hourly change uses absolute magnitude with explicit up down flat and absent semantics',()=>{
 assert.deepEqual(marketplaceChange(219,true),{direction:'up',amount:219,description:'较昨日同时段增加 219'});
 assert.deepEqual(marketplaceChange(-12345,true),{direction:'down',amount:12345,description:'较昨日同时段减少 12,345'});
 assert.deepEqual(marketplaceChange(0,true),{direction:'flat',amount:0,description:'与昨日同时段持平'});
 assert.equal(marketplaceChange(null,true),null);
 assert.equal(marketplaceChange(-3,false)?.description,'Decreased by 3 compared with the same hour yesterday');
 assert.equal(marketplaceChange(0,false)?.description,'Unchanged from the same hour yesterday');
 assert.equal(marketplaceChange(3,false)?.description,'Increased by 3 compared with the same hour yesterday');
 assert.equal(marketplaceMetric({...storeSkill,installs:291,change:null},'hot',true),'1h安装量：291');
 assert.equal(marketplaceMetric({...storeSkill,installs:291,change:0},'hot',true),'1h安装量：291');
});

test('search uses the selected 12 24 or 48 page size without reordering or dropping the capped 100 results',()=>{
 for(const length of [0,1,12,13,24,25,48,49,100])for(const size of [12,24,48]){
  const items=Array.from({length},(_,index)=>({id:`relevance-${index}`}));const totalPages=Math.max(1,Math.ceil(length/size));
  const pages=Array.from({length:totalPages},(_,index)=>searchPageItems(items,index+1,size));
  assert.deepEqual(pages.flatMap(page=>page.items),items);assert(pages.every(page=>page.items.length<=size));
  assert.equal(searchPageItems(items,99,size).page,totalPages);assert.equal(searchPageItems(items,0,size).page,1);assert.equal(searchPageItems(items,1,size).totalPages,totalPages);
 }
 assert.equal(searchPageItems(Array.from({length:100}),1).items.length,12,'omitted page size retains the default');
});
