import { useContext } from 'react';
import { BackOfficeConcept } from './back-office-presentation';

import { backOfficeLabel } from './back-office-labels';

export function BackOfficeText({ text }: { text: string }) {
  return backOfficeLabel(text, useContext(BackOfficeConcept));
}

/** Labels originate from existing role/staff-type relationships, never personal names. */
export function BackOfficeStaffLabel({ label }: { label: string }) {
  const concept = useContext(BackOfficeConcept);
  const staffLabels: Readonly<Record<string, string>> = {
    'owner · employee': 'Owner · Employee',
    'owner · office_manager': 'Owner · Office Manager',
    'admin · office_manager': 'Admin · Office Manager',
    'staff · field_staff': 'Staff · Field Staff',
    'staff · estimator': 'Staff · Estimator',
    'staff · employee': 'Staff · Employee',
  };
  return concept ? (staffLabels[label] ?? label) : label;
}
