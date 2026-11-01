import { acceptanceRoster } from '../server/staging/roster.ts';
console.log(
  JSON.stringify(
    {
      mode: 'offline-plan-only',
      identities: acceptanceRoster(),
      hostedActions: 'NONE',
      separateApprovals: [
        '22 synthetic Auth identities and genuine human TOTP enrollment',
        'three-company fixtures and scoped workflow writes',
        'private platform/release/workload grants with exact expiry and scope',
        'protected nonproduction deploy of reviewed artifact',
      ],
      storagePositiveControls:
        'Require separately approved isolated synthetic fixtures; no fake clean verdict on real supplier bytes.',
    },
    null,
    2,
  ),
);
