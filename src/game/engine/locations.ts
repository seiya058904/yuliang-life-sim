import type { ContentRegistry, GameState, LocationDefinition } from '../content/contracts';

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
  return Math.max(1, jobLocation.transportCostMultiplier) * vehicleFactor;
}

export function locationSummary(content: ContentRegistry): readonly LocationDefinition[] { return content.locations ?? []; }
