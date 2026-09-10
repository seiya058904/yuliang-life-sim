import type { ContentPack, ContentRegistry } from './contracts';
import { officialContent } from './official';
import { seedContent } from './seed';

function preferOfficial<T>(official: readonly T[], seed: readonly T[]): readonly T[] {
  if (official.length === 0) return seed;
  const byId = new Map(seed.map((entry) => [(entry as { id: string }).id, entry]));
  official.forEach((entry) => byId.set((entry as { id: string }).id, entry));
  return [...byId.values()];
}

export const contentRegistry: ContentRegistry = {
  jobs: preferOfficial(officialContent.jobs, seedContent.jobs),
  items: preferOfficial(officialContent.items, seedContent.items),
  housing: preferOfficial(officialContent.housing, seedContent.housing),
  businesses: preferOfficial(officialContent.businesses, seedContent.businesses),
  assets: preferOfficial(officialContent.assets, seedContent.assets),
  characters: preferOfficial(officialContent.characters, seedContent.characters),
  events: preferOfficial(officialContent.events, seedContent.events),
  eventChains: preferOfficial(officialContent.eventChains, seedContent.eventChains),
  milestones: preferOfficial(officialContent.milestones, seedContent.milestones),
  vocabulary: seedContent.vocabulary,
  activities: preferOfficial(officialContent.activities ?? [], seedContent.activities ?? []),
  courses: preferOfficial(officialContent.courses ?? [], seedContent.courses ?? []),
  investments: preferOfficial(officialContent.investments ?? [], seedContent.investments ?? []),
  companies: preferOfficial(officialContent.companies ?? [], seedContent.companies ?? []),
  locations: officialContent.locations ?? [],
  venues: preferOfficial(officialContent.venues ?? [], seedContent.venues ?? []),
  dialogues: preferOfficial(officialContent.dialogues ?? [], seedContent.dialogues ?? []),
  relationshipInteractions: preferOfficial(officialContent.relationshipInteractions ?? [], seedContent.relationshipInteractions ?? []),
  services: preferOfficial(officialContent.services ?? [], seedContent.services ?? []),
  subscriptions: preferOfficial(officialContent.subscriptions ?? [], seedContent.subscriptions ?? []),
  storylines: preferOfficial(officialContent.storylines ?? [], seedContent.storylines ?? []),
  vacancyTemplates: officialContent.vacancyTemplates,
  packs: [{ packId: 'seed-core', version: 1, contentStatus: 'seed' }, { packId: 'official-core', version: 1, contentStatus: 'official' }],
};

export function composeContentRegistry(overrides: Partial<ContentRegistry> = {}): ContentRegistry {
  return {
    jobs: preferOfficial(overrides.jobs ?? [], seedContent.jobs),
    items: preferOfficial(overrides.items ?? [], seedContent.items),
    housing: preferOfficial(overrides.housing ?? [], seedContent.housing),
    businesses: preferOfficial(overrides.businesses ?? [], seedContent.businesses),
    assets: preferOfficial(overrides.assets ?? [], seedContent.assets),
    characters: preferOfficial(overrides.characters ?? [], seedContent.characters),
    events: preferOfficial(overrides.events ?? [], seedContent.events),
    eventChains: preferOfficial(overrides.eventChains ?? [], seedContent.eventChains),
    milestones: preferOfficial(overrides.milestones ?? [], seedContent.milestones),
    vocabulary: overrides.vocabulary ?? contentRegistry.vocabulary,
    activities: preferOfficial(overrides.activities ?? [], seedContent.activities ?? []),
    courses: preferOfficial(overrides.courses ?? [], seedContent.courses ?? []),
    investments: preferOfficial(overrides.investments ?? [], seedContent.investments ?? []),
    companies: preferOfficial(overrides.companies ?? [], seedContent.companies ?? []),
    locations: overrides.locations ?? contentRegistry.locations ?? [],
    venues: preferOfficial(overrides.venues ?? [], seedContent.venues ?? []),
    dialogues: preferOfficial(overrides.dialogues ?? [], seedContent.dialogues ?? []),
    relationshipInteractions: preferOfficial(overrides.relationshipInteractions ?? [], seedContent.relationshipInteractions ?? []),
    services: preferOfficial(overrides.services ?? [], seedContent.services ?? []),
    subscriptions: preferOfficial(overrides.subscriptions ?? [], seedContent.subscriptions ?? []),
    storylines: preferOfficial(overrides.storylines ?? [], seedContent.storylines ?? []),
    vacancyTemplates: (overrides.vacancyTemplates ?? contentRegistry.vacancyTemplates)?.filter((template) =>
      preferOfficial(overrides.jobs ?? [], seedContent.jobs).some((job) => job.id === template.jobId)
      && preferOfficial(overrides.companies ?? [], seedContent.companies ?? []).some((company) => company.id === template.companyId)),
    packs: overrides.packs ?? contentRegistry.packs,
  };
}

export function composeContentPacks(packs: readonly ContentPack[]): ContentRegistry {
  const merged: Partial<ContentRegistry> = { ...contentRegistry };
  for (const pack of packs) {
    for (const key of ['jobs', 'items', 'housing', 'businesses', 'assets', 'characters', 'events', 'eventChains', 'milestones', 'activities', 'courses', 'investments', 'companies', 'locations', 'venues', 'dialogues', 'relationshipInteractions', 'services', 'subscriptions', 'storylines', 'vacancyTemplates'] as const) {
      const values = pack.content[key] as readonly { id: string }[] | undefined;
      if (!values) continue;
      const existing = (merged[key] ?? []) as readonly { id: string }[];
      const byId = new Map(existing.map((entry) => [entry.id, entry]));
      values.forEach((entry) => byId.set(entry.id, entry));
      (merged as Record<string, unknown>)[key] = [...byId.values()];
    }
    if (pack.content.vocabulary) merged.vocabulary = {
      capabilities: [...new Set([...(merged.vocabulary?.capabilities ?? []), ...(pack.content.vocabulary.capabilities ?? [])])],
      tags: [...new Set([...(merged.vocabulary?.tags ?? []), ...(pack.content.vocabulary.tags ?? [])])],
      attributes: [...new Set([...(merged.vocabulary?.attributes ?? []), ...(pack.content.vocabulary.attributes ?? [])])],
      financialCategories: [...new Set([...(merged.vocabulary?.financialCategories ?? []), ...(pack.content.vocabulary.financialCategories ?? [])])],
    };
  }
  const registry = composeContentRegistry(merged);
  return { ...registry, packs: [...(contentRegistry.packs ?? []), ...packs.map((pack) => ({ packId: pack.packId, version: pack.version, contentStatus: pack.contentStatus }))] };
}
