import { useCallback } from 'react';
import type { Operations } from '../../lib/operations';
import type { CompanyProfile } from '../../domain/platform';
import { propertyRepository } from '../../lib/property';
import { useResource } from '../forms-state';
import { ResourceStatus } from '../forms';
import { UnbilledReview } from './UnbilledReview';
export function PropertyJobReview({
  operations,
  company,
}: {
  operations: Operations;
  company: CompanyProfile;
}) {
  const repo = propertyRepository(operations),
    ready = useResource(
      useCallback(async () => {
        await repo.initialize(company);
        return true;
      }, [repo, company]),
    );
  return (
    <details>
      <summary>Unbilled materials · local procurement review</summary>
      {ready.data ? (
        <UnbilledReview repo={repo} org={company.id} />
      ) : (
        <ResourceStatus {...ready} />
      )}
    </details>
  );
}
