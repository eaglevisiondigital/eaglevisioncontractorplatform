import {
  costCategories,
  jobFinancials,
  type Job,
  type JobProjection,
} from '../../domain/jobs/financials';
import type { Phase3Repository } from '../../lib/phase3';
export const forecastFields = [
  ...costCategories,
  'overrun_bps',
  'erosion_bps',
  'costs_complete',
] as const;
export type ForecastField = (typeof forecastFields)[number];
export type ForecastChoices = Partial<
  Record<ForecastField, 'entered' | 'saved'>
>;
export function forecastValue(p: JobProjection, field: ForecastField) {
  return field === 'overrun_bps' ||
    field === 'erosion_bps' ||
    field === 'costs_complete'
    ? p[field]
    : p.remaining[field];
}
export function exactForecastSource(
  org: string,
  base: Job,
  latest: Job | undefined,
): asserts latest is Job {
  if (
    !latest ||
    base.organization_id !== org ||
    latest.organization_id !== org ||
    latest.id !== base.id ||
    !Number.isSafeInteger(latest.lock_revision) ||
    latest.lock_revision < base.lock_revision ||
    JSON.stringify(latest.baseline) !== JSON.stringify(base.baseline)
  )
    throw Error(
      'Exact job and original baseline unavailable; no forecast write',
    );
}
export function forecastChanged(base: Job, latest: Job) {
  return JSON.stringify(base) !== JSON.stringify(latest);
}
export function forecastConflicts(
  org: string,
  base: Job,
  entered: JobProjection,
  latest: Job,
) {
  exactForecastSource(org, base, latest);
  jobFinancials({ ...base, projection: entered });
  return forecastFields.filter((field) => {
    const original = forecastValue(base.projection, field),
      mine = forecastValue(entered, field),
      saved = forecastValue(latest.projection, field);
    return mine !== original && saved !== original && mine !== saved;
  });
}
export function reconcileForecast(
  org: string,
  base: Job,
  entered: JobProjection,
  latest: Job,
  choices: ForecastChoices,
): JobProjection {
  const conflicts = forecastConflicts(org, base, entered, latest);
  if (
    conflicts.some(
      (field) => choices[field] !== 'entered' && choices[field] !== 'saved',
    )
  )
    throw Error('Choose the saved or entered value for every conflict');
  const merged = structuredClone(latest.projection);
  for (const field of forecastFields) {
    const mine = forecastValue(entered, field),
      original = forecastValue(base.projection, field);
    const selected = conflicts.includes(field)
      ? choices[field] === 'entered'
      : mine !== original;
    if (!selected) continue;
    if (field === 'costs_complete')
      merged.costs_complete = entered.costs_complete;
    else if (field === 'overrun_bps' || field === 'erosion_bps')
      merged[field] = entered[field];
    else merged.remaining[field] = entered.remaining[field];
  }
  // Any changed cost source requires a new explicit completion confirmation.
  merged.costs_complete = false;
  jobFinancials({ ...latest, projection: merged });
  return merged;
}
// UI uncertainty guard, not business state, restart custody or an outcome receipt.
const unknown = new WeakMap<Phase3Repository, Set<string>>();
export function forecastHeld(
  repo: Phase3Repository,
  org: string,
  jobId: string,
) {
  return unknown.get(repo)?.has(`${org}/${jobId}`) ?? false;
}
export function holdForecast(
  repo: Phase3Repository,
  org: string,
  jobId: string,
) {
  const holds = unknown.get(repo) ?? new Set<string>();
  holds.add(`${org}/${jobId}`);
  unknown.set(repo, holds);
}

const inFlight = new WeakMap<Phase3Repository, Set<string>>();
export function acquireForecastSave(
  repo: Phase3Repository,
  org: string,
  jobId: string,
) {
  if (forecastHeld(repo, org, jobId))
    throw Error('Forecast outcome UNKNOWN; exact read only');
  const key = `${org}/${jobId}`,
    active = inFlight.get(repo) ?? new Set<string>();
  if (active.has(key)) throw Error('Another forecast save is in progress');
  active.add(key);
  inFlight.set(repo, active);
  return () => {
    active.delete(key);
  };
}
