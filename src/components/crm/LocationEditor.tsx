import { useLayoutEffect, useRef, useState } from 'react';
import type { Operations, LocationDraft, Row } from '../../lib/operations';
import { FieldsForm, type Field } from '../forms';
import { useTask } from '../forms-state';
import { locationSourceKey, saveCurrentLocation } from './location-source';
const fields: Field[] = [
  { name: 'address_line1', label: 'Street address', required: true },
  { name: 'address_line2', label: 'Address line 2' },
  { name: 'city', label: 'City', required: true },
  { name: 'region', label: 'State / region', required: true },
  { name: 'postal_code', label: 'Postal code', required: true },
  { name: 'country_code', label: 'Country code', required: true, maxLength: 2 },
];
export function LocationEditor({
  repo,
  org,
  customer,
  onSaved,
  location,
}: {
  repo: Operations;
  org: string;
  customer: string;
  onSaved: () => void;
  location?: Row<'service_locations'>;
}) {
  const [source, setSource] = useState(location),
    [reviewed, setReviewed] = useState(false),
    [refreshing, setRefreshing] = useState(false),
    [readError, setReadError] = useState('');
  const task = useTask(),
    generation = useRef(0);
  useLayoutEffect(() => {
    const frame = generation.current + 1;
    generation.current = frame;
    return () => {
      generation.current++;
    };
  }, [repo, org, customer, location?.id]);
  let valid = true;
  try {
    if (location) {
      if (!source || source.id !== location.id) throw Error();
      locationSourceKey(source, org, customer);
    }
  } catch {
    valid = false;
  }
  const available = valid && !refreshing && !readError;
  return (
    <section
      aria-label="Service location editing"
      onChange={(event) => {
        if ((event.target as HTMLElement).closest('form')) {
          generation.current++;
          setReviewed(false);
        }
      }}
    >
      {location && (
        <>
          <p>
            {valid && source
              ? `Saved source: ${source.address_line1}${source.address_line2 ? `, ${source.address_line2}` : ''}, ${source.city}, ${source.region} ${source.postal_code}, ${source.country_code}. These are recorded address details, not verified site conditions.`
              : 'Exact saved location unavailable · UNKNOWN'}
          </p>
          <button
            className="secondary"
            disabled={task.busy || refreshing}
            onClick={() => {
              const frame = ++generation.current;
              setReviewed(false);
              setRefreshing(true);
              setReadError('');
              void repo
                .listLocations(org, customer)
                .then((rows) => {
                  if (frame !== generation.current) return;
                  const matching = rows.filter((r) => r.id === location.id);
                  if (matching.length !== 1) throw Error();
                  locationSourceKey(matching[0], org, customer);
                  setSource(matching[0]);
                })
                .catch(() => {
                  if (frame === generation.current)
                    setReadError(
                      'Current location source unavailable · UNKNOWN',
                    );
                })
                .finally(() => {
                  if (frame === generation.current) setRefreshing(false);
                });
            }}
          >
            Refresh saved location
          </button>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={reviewed}
              disabled={!available || task.busy}
              onChange={(e) => setReviewed(e.target.checked)}
            />
            I reviewed the current saved location and these address changes
          </label>
        </>
      )}
      {readError && <p role="status">{readError}</p>}
      <fieldset disabled={!available || task.busy}>
        <FieldsForm
          fields={fields}
          initial={location ?? { country_code: 'US' }}
          submitLabel={location ? 'Update location' : 'Add location'}
          busy={task.busy}
          onSubmit={async (values) => {
            const frame = generation.current;
            if (
              await task.run(() =>
                saveCurrentLocation(
                  repo,
                  org,
                  customer,
                  source,
                  values as unknown as LocationDraft,
                  !location || reviewed,
                  () => frame === generation.current && available,
                ),
              )
            ) {
              if (frame === generation.current) onSaved();
            }
          }}
        />
      </fieldset>
      <p role="status">{task.message}</p>
    </section>
  );
}
