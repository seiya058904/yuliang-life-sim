import type { ContentRegistry, GameState, HousingDefinition, LocationDefinition } from '../content/contracts';
import { modifierValue } from './effects';

function developmentLevel(state: GameState, locationId?: string): number {
  return locationId ? Math.min(5, Math.max(0, state.locationDevelopment?.[locationId] ?? 0)) : 0;
}

export function housingRentPerDay(state: GameState, home: HousingDefinition): number {
  const base = home.rentPerDay * (1 + developmentLevel(state, home.locationId) * 0.02);
  return Math.max(0, Math.round(modifierValue(state, 'housing_rent', base, ['housing'])));
}

export function housingPrice(state: GameState, home: HousingDefinition): number | undefined {
  return home.price === undefined ? undefined : Math.round(home.price * (1 + developmentLevel(state, home.locationId) * 0.03));
}

export interface HousingMortgageTerms {
  downPayment: number;
  principal: number;
  monthlyPayment: number;
  totalMonths: number;
}

export function housingMortgageTerms(state: GameState, home: HousingDefinition): HousingMortgageTerms | undefined {
  const price = housingPrice(state, home);
  if (price === undefined) return undefined;
  const downPayment = Math.ceil(price * 0.25);
  const principal = price - downPayment;
  return { downPayment, principal, monthlyPayment: Math.ceil(principal / 24 + principal * 0.004), totalMonths: 24 };
}

export function locationForCurrentJob(state: GameState, content: ContentRegistry): LocationDefinition | undefined {
  const jobId = state.employment?.jobId ?? state.currentJobId;
  const job = content.jobs.find((entry) => entry.id === jobId);
  const companyId = state.employment?.companyId ?? job?.companyId ?? content.companies?.find((company) => company.jobIds?.includes(jobId ?? ''))?.id;
  const locationId = content.companies?.find((company) => company.id === companyId)?.locationId;
  return content.locations?.find((location) => location.id === locationId);
}

export function commuteCostMultiplier(state: GameState, content: ContentRegistry): number {
  const hasVehicle = Object.keys(state.assets).some((assetId) => content.assets.some((asset) => asset.id === assetId && asset.kind === 'vehicle'));
  const vehicleFactor = hasVehicle ? 0.8 : 1;
  const homeId = content.housing.find((home) => home.id === state.housing.housingId)?.locationId;
  const jobLocation = locationForCurrentJob(state, content);
  if (!jobLocation || !homeId || homeId === jobLocation.id) return vehicleFactor;
  const developmentFactor = 1 - developmentLevel(state, jobLocation.id) * 0.01;
  return Math.max(1, jobLocation.transportCostMultiplier) * developmentFactor * vehicleFactor;
}

export function locationSummary(content: ContentRegistry): readonly LocationDefinition[] { return content.locations ?? []; }

export function recordLocationVisit(state: GameState, locationId: string, content: ContentRegistry): void {
  if (!content.locations?.some((location) => location.id === locationId)) return;
  state.locationVisits ??= {};
  state.locationVisits[locationId] = (state.locationVisits[locationId] ?? 0) + 1;
}
