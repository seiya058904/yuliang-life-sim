import type { ContentRegistry } from './contracts';
import { vocabulary } from './vocabulary';
import { officialJobs } from './official/jobs';
import { officialItems } from './official/items';
import { officialHousing } from './official/housing';
import { officialBusinesses } from './official/businesses';
import { officialAssets } from './official/assets';
import { officialCharacters } from './official/characters';
import { officialEvents } from './official/events';
import { officialEventChains } from './official/eventChains';
import { officialMilestones } from './official/milestones';
import { officialCompanies } from './official/companies';
import { officialVacancyTemplates } from './official/vacancies';
import { officialLocations } from './official/locations';

export const officialContent: ContentRegistry = { jobs: officialJobs, items: officialItems, housing: officialHousing, businesses: officialBusinesses, assets: officialAssets, characters: officialCharacters, events: officialEvents, eventChains: officialEventChains, milestones: officialMilestones, companies: officialCompanies, locations: officialLocations, vacancyTemplates: officialVacancyTemplates, vocabulary };
