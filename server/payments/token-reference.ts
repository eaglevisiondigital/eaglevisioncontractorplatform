import type {
  GatewayToken,
  SandboxIntent,
  SandboxMerchant,
  SandboxResult,
} from './sandbox';
import { uuid } from '../providers/safety';
export interface TokenReference {
  id: string;
  organizationId: string;
  merchantConfigId: string;
  customerId: string;
  provider: SandboxMerchant['provider'];
  mode: 'sandbox';
  expiresAt: string;
}
export interface SandboxTokenVault {
  // Resolve server-side under current customer/provider authority. For one-use
  // tokens, atomically bind consumption to this same durable payment intent key.
  // A browser cannot create/replace references or submit raw token/card values.
  resolve(
    scope: Readonly<
      Omit<TokenReference, 'expiresAt'> & { idempotencyKey: string }
    >,
  ): Promise<{ reference: TokenReference; token: GatewayToken }>;
}
export async function captureReferencedToken(
  merchant: SandboxMerchant,
  intent: SandboxIntent,
  customerId: string,
  referenceId: string,
  vault: SandboxTokenVault,
  gateway: {
    capture(intent: SandboxIntent, token: GatewayToken): Promise<SandboxResult>;
  },
) {
  const m = Object.freeze({ ...merchant }),
    i = Object.freeze({ ...intent });
  if (
    m.mode !== 'sandbox' ||
    i.organizationId !== m.organizationId ||
    i.merchantConfigId !== m.merchantConfigId ||
    ![
      m.organizationId,
      m.merchantConfigId,
      customerId,
      referenceId,
      i.idempotencyKey,
    ].every((v) => uuid.test(v)) ||
    !(Date.parse(m.approvedUntil) > Date.now()) ||
    !(Date.parse(i.expiresAt) > Date.now())
  )
    throw new Error('Invalid sandbox token scope');
  const scope = Object.freeze({
    id: referenceId,
    organizationId: m.organizationId,
    merchantConfigId: m.merchantConfigId,
    customerId,
    provider: m.provider,
    mode: 'sandbox' as const,
    idempotencyKey: i.idempotencyKey,
  });
  const resolved = await vault.resolve(scope),
    reference = Object.freeze({ ...resolved.reference }),
    token = Object.freeze({ ...resolved.token });
  if (
    ![
      'id',
      'organizationId',
      'merchantConfigId',
      'customerId',
      'provider',
      'mode',
    ].every(
      (k) =>
        reference[k as keyof TokenReference] === scope[k as keyof typeof scope],
    ) ||
    token.provider !== m.provider ||
    !(Date.parse(reference.expiresAt) > Date.now()) ||
    !(Date.parse(i.expiresAt) > Date.now()) ||
    !(Date.parse(m.approvedUntil) > Date.now())
  )
    throw new Error('Token reference binding or expiry denied');
  return gateway.capture(i, token);
}
