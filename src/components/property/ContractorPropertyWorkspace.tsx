import type { ReactNode } from 'react';
import type { CompanyProfile } from '../../domain/platform';
import type { Operations } from '../../lib/operations';
import { ContractorBackOfficeLayout } from './ContractorBackOfficeLayout';
import { PropertyWorkspace } from './PropertyWorkspace';

/** Reuses App's synthetic session. No alternate repository or implicit fixture preparation. */
export function ContractorPropertyWorkspace({
  operations,
  company,
  companies,
  onCompanyChange,
  navigation,
  message,
}: {
  operations: Operations;
  company: CompanyProfile;
  companies: CompanyProfile[];
  onCompanyChange(id: string): void;
  navigation: ReactNode;
  message?: string;
}) {
  return (
    <ContractorBackOfficeLayout
      integrated
      company={company}
      companies={companies}
      onCompanyChange={onCompanyChange}
      navigation={navigation}
    >
      {message && <p role="status">{message}</p>}
      <PropertyWorkspace
        operations={operations}
        company={company}
        section="Property operations"
      />
    </ContractorBackOfficeLayout>
  );
}
