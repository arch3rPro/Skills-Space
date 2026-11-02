import type { CodexRule } from './codex';

export const codexDefaultKeys = [
  'skillCatalogTokens', 'bundledSkills', 'skillDependencies', 'pluginsEnabled',
  'appsEnabled', 'appsApproval', 'appsReviewer', 'appsDestructive', 'appsOpenWorld',
] as const;
export type CodexDefaultKey = typeof codexDefaultKeys[number];
export type CodexDefaultValue = boolean | number | string | null;
export type CodexDefaults = {
  revision: string;
  configPath: string;
  writable: boolean;
  fields: Record<CodexDefaultKey, { value: CodexDefaultValue; effective: CodexDefaultValue; overridden: boolean }>;
  rules: CodexRule[];
};
export type CodexDefaultsDraft = Record<CodexDefaultKey, string>;

export function codexDefaultsDraft(settings?: CodexDefaults): CodexDefaultsDraft {
  const draft: CodexDefaultsDraft = {
    skillCatalogTokens: 'inherit', bundledSkills: 'inherit', skillDependencies: 'inherit', pluginsEnabled: 'inherit',
    appsEnabled: 'inherit', appsApproval: 'inherit', appsReviewer: 'inherit', appsDestructive: 'inherit', appsOpenWorld: 'inherit',
  };
  if (settings) for (const key of codexDefaultKeys) {
    const value = settings.fields[key].value;
    draft[key] = value === null ? 'inherit' : String(value);
  }
  return draft;
}

export function codexDefaultValue(key: CodexDefaultKey, value: string): CodexDefaultValue {
  if (value === 'inherit') return null;
  if (key === 'skillCatalogTokens') {
    if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 10000) throw new Error('catalogBudget');
    return Number(value);
  }
  if (key === 'appsApproval' && ['auto', 'prompt', 'writes', 'approve'].includes(value)) return value;
  if (key === 'appsReviewer' && ['user', 'auto_review'].includes(value)) return value;
  if (key !== 'appsApproval' && key !== 'appsReviewer' && ['true', 'false'].includes(value)) return value === 'true';
  throw new Error('invalidDefault');
}

export function codexDefaultsDirty(settings: CodexDefaults | null, draft: CodexDefaultsDraft): boolean {
  if (!settings) return false;
  const before = codexDefaultsDraft(settings);
  return codexDefaultKeys.some(key => before[key] !== draft[key]);
}

export function codexDefaultsChanges(settings: CodexDefaults, draft: CodexDefaultsDraft) {
  const before = codexDefaultsDraft(settings);
  return codexDefaultKeys.filter(key => draft[key] !== before[key]).map(key => ({
    key, value: codexDefaultValue(key, draft[key]), baseValue: settings.fields[key].value,
  }));
}
