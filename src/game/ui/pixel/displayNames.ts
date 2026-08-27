type NamedEntry = { id: string; name: string };

const acronymWords = new Set(['AI', 'CEO', 'EV', 'Gig', 'UI', 'UX']);

function titleCaseWord(word: string): string {
  if (!word) return word;
  if (acronymWords.has(word.toUpperCase())) return word.toUpperCase();
  return `${word.slice(0, 1).toUpperCase()}${word.slice(1).toLowerCase()}`;
}

/** Turns a legacy/canonical id into a readable presentation fallback without changing the id. */
export function humanizeContentId(id: string): string {
  const leaf = id.trim().split('.').at(-1) ?? id.trim();
  const words = leaf.replace(/[-_]+/g, ' ').split(/\s+/).filter(Boolean);
  return words.map(titleCaseWord).join(' ') || '未命名内容';
}

/** Resolves authored names first, then gives unknown legacy ids a readable fallback. */
export function displayContentName<T extends NamedEntry>(id: string | undefined, entries: readonly T[], fallback = '未命名内容'): string {
  if (!id) return fallback;
  return entries.find((entry) => entry.id === id)?.name ?? humanizeContentId(id);
}

export function displayMappedLabel(id: string | undefined, labels: Record<string, string>, fallback?: string): string {
  if (!id) return fallback ?? '未命名内容';
  return labels[id] ?? humanizeContentId(id);
}
