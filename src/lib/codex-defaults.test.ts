import assert from 'node:assert/strict';
import test from 'node:test';
import { codexDefaultKeys, codexDefaultsChanges, codexDefaultsDirty, codexDefaultsDraft, type CodexDefaults } from './codex-defaults.ts';

function fixture(): CodexDefaults {
  return {
    revision:'r1', configPath:'/fixture/config.toml', writable:true,
    fields: {
      skillCatalogTokens:{value:null,effective:null,overridden:false},
      bundledSkills:{value:null,effective:true,overridden:false},
      skillDependencies:{value:null,effective:true,overridden:false},
      pluginsEnabled:{value:false,effective:false,overridden:false},
      appsEnabled:{value:null,effective:true,overridden:false},
      appsApproval:{value:'writes',effective:'prompt',overridden:true},
      appsReviewer:{value:null,effective:'user',overridden:false},
      appsDestructive:{value:null,effective:false,overridden:false},
      appsOpenWorld:{value:null,effective:false,overridden:false},
    }, rules:[{name:'existing',enabled:false}],
  };
}

test('draft uses personal overrides, retaining false and inheritance instead of copying effective policy',()=>{
  const settings=fixture(), draft=codexDefaultsDraft(settings);
  assert.equal(draft.pluginsEnabled,'false');
  assert.equal(draft.appsApproval,'writes');
  assert.equal(draft.appsEnabled,'inherit');
  assert.equal(codexDefaultsDirty(settings,draft),false);
  assert.deepEqual(codexDefaultsChanges(settings,draft),[]);
});

test('save sends changed leaves only; restoring defaults deletes overrides without editing rules',()=>{
  const settings=fixture(), original=structuredClone(settings), draft=codexDefaultsDraft(settings);
  draft.pluginsEnabled='inherit'; draft.skillCatalogTokens='3000';
  assert.deepEqual(codexDefaultsChanges(settings,draft),[
    {key:'skillCatalogTokens',value:3000,baseValue:null},
    {key:'pluginsEnabled',value:null,baseValue:false},
  ]);
  assert.deepEqual(settings,original);
  const reset=codexDefaultsDraft();
  assert.deepEqual(codexDefaultsChanges(settings,reset).map(change=>change.key),['pluginsEnabled','appsApproval']);
  assert.ok(codexDefaultKeys.every(key=>reset[key]==='inherit'));
});

test('reject invalid budgets and retain unchanged existing values while editing other fields',()=>{
  const settings=fixture();
  for(const invalid of ['', '0', '-1', '10001', '1.5', 'Infinity', '1e3']) {
    const draft=codexDefaultsDraft(settings);draft.skillCatalogTokens=invalid;
    assert.throws(()=>codexDefaultsChanges(settings,draft));
  }
  settings.fields.skillCatalogTokens.value=15000;
  const draft=codexDefaultsDraft(settings);draft.appsEnabled='false';
  assert.deepEqual(codexDefaultsChanges(settings,draft),[{key:'appsEnabled',value:false,baseValue:null}]);
});
