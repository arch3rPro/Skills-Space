// Affect eligible visible items only; preserve selections outside the current filter.
export function selectVisible(selected: string[], eligible: string[], invert = false): string[] {
  const items = [...new Set(eligible)];
  const visible = new Set(items);
  return [...selected.filter(id=>!visible.has(id)), ...items.filter(id=>!invert || !selected.includes(id))];
}
