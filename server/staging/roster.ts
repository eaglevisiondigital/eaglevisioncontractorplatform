import { pilotNames } from './acceptance.ts';
export const acceptanceRoles = [
  'owner',
  'estimator',
  'supervisor',
  'assigned-field',
  'unassigned-field',
  'revoked-staff',
  'customer',
] as const;
// Offline plan only. No credentials, UUIDs, sessions, grants or accounts generated.
export function acceptanceRoster() {
  return [
    {
      alias: 'platform-operator',
      company: null,
      role: 'platform-only',
      requiredMfa: true,
    },
    ...pilotNames.flatMap((company, index) =>
      acceptanceRoles.map((role) => ({
        alias: `pilot-${index + 1}-${role}`,
        company,
        role,
        requiredMfa: role === 'owner',
      })),
    ),
  ];
}
