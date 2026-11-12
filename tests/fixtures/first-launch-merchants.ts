import type { SandboxMerchant } from '../../server/payments/sandbox';

/** Fictional test identities only. Launch order is not a tenant/merchant appointment. */
export function fictionalLaunchMerchants(approvedUntil: string) {
  return ([1, 2] as const).map((launchOrder) => ({
    launchOrder,
    fictional: true as const,
    executionAuthorized: false as const,
    merchant: {
      organizationId: `10000000-0000-4000-8000-00000000000${launchOrder}`,
      merchantConfigId: `20000000-0000-4000-8000-00000000000${launchOrder}`,
      provider: 'nmi',
      mode: 'sandbox',
      approvalReference: 'Fictional offline test only; not merchant boarding',
      approvedUntil,
    } satisfies SandboxMerchant,
  }));
}
