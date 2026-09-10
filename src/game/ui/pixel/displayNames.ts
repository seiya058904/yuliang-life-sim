type NamedEntry = { id: string; name: string };

const acronymWords = new Set(['AI', 'CEO', 'EV', 'Gig', 'UI', 'UX']);

const settlementHighlightLabels: Readonly<Record<string, string>> = {
  office_basics: '办公室基础',
  operations_foundation: '运营基础',
  client_service_experience: '客户服务经验',
  retail_operations_experience: '零售运营经验',
  logistics_experience: '物流经验',
  data_analysis_foundation: '数据分析基础',
  project_coordination: '项目协调',
  people_management_basics: '人员管理基础',
  media_production_experience: '媒体制作经验',
  investment_basics: '投资基础',
};

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

/** Replaces canonical career ids in authored settlement copy without changing the source id. */
export function displaySettlementHighlightLabel(label: string): string {
  return label.replace(/[A-Za-z][A-Za-z0-9_-]*/g, (token) => {
    const authored = settlementHighlightLabels[token];
    if (authored) return authored;
    return token.includes('_') || token.includes('-') ? humanizeContentId(token) : token;
  });
}
