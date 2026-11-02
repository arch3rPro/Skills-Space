import type { Target } from './upstream';
import type { PiPackageInventory } from './pi-packages';

// Session-only inventory: a menu remount is not a refresh or configuration write.
export function createPiPackageCache(read: (target: Target) => Promise<PiPackageInventory>) {
  type Entry = { snapshot: PiPackageInventory | null; pending?: Promise<PiPackageInventory>; generation: number };
  const entries = new Map<string, Entry>();
  const key = (target: Target) => JSON.stringify([target.host, target.scope, target.projectPath]);
  const entry = (target: Target) => {
    const id = key(target);
    let value = entries.get(id);
    if (!value) { value = { snapshot: null, generation: 0 }; entries.set(id, value); }
    return value;
  };
  const invalidate = (target?: Target) => {
    for (const [id, value] of entries) {
      if (!target || target.scope === 'global' || id === key(target)) {
        value.snapshot = null; value.generation++; value.pending = undefined;
      }
    }
  };
  return {
    peek: (target: Target) => entry(target).snapshot,
    invalidate,
    accept(target: Target, snapshot: PiPackageInventory, changed = true) {
      if (changed) invalidate();
      const value = entry(target); value.generation++; value.pending = undefined; value.snapshot = snapshot;
    },
    async load(target: Target, force = false): Promise<PiPackageInventory> {
      const value = entry(target);
      if (!force && value.snapshot) return value.snapshot;
      // A requested refresh may discover an external/global edit affecting other scopes.
      if (force) for (const other of entries.values()) {
        if (other !== value) { other.snapshot = null; other.generation++; other.pending = undefined; }
      }
      if (value.pending) return value.pending;
      const generation = value.generation;
      const pending = read(target).then(snapshot => {
        if (generation === value.generation) value.snapshot = snapshot;
        return snapshot;
      });
      value.pending = pending;
      try { return await pending; } finally { if (value.pending === pending) value.pending = undefined; }
    },
  };
}
export type PiPackageCache = ReturnType<typeof createPiPackageCache>;
