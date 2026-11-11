export function declaredSkillVersion(document, data, isAlias) {
  const resolve = node => isAlias(node) ? node.resolve(document) : node;
  const metadata = resolve(document.get('metadata', true));
  for (const [node, value] of [[metadata?.get?.('version', true), data?.metadata?.version], [document.get('version', true), data?.version]]) {
    const label = typeof value === 'string' ? value : typeof value === 'number' && Number.isFinite(value) ? resolve(node)?.source : null;
    if (typeof label === 'string' && label.trim()) return label.trim();
  }
  return null;
}
