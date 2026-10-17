import {
  createPublicKey,
  verify,
  type JsonWebKeyInput,
  type KeyObject,
} from 'node:crypto';
import { providerJson, uuid } from '../providers/safety';
import type { WorkloadIdentity } from './isolated-service';
export interface ApprovedWorkloadKeys {
  issuer: string;
  audience: string;
  subject: string;
  organizationId: string;
  expiresAt: number;
  keys: readonly { kid: string; jwk: JsonWebKeyInput['key'] }[];
}
/** Pinned operator-provisioned JWKS snapshot. Never follows JWT jku/x5u/jwk or
 * caller URLs. No live discovery/key fetch, credential creation or default trust. */
export class WorkloadJwtVerifier {
  private readonly policy: Readonly<Omit<ApprovedWorkloadKeys, 'keys'>>;
  private readonly keys = new Map<string, KeyObject>();
  constructor(config: ApprovedWorkloadKeys) {
    this.policy = Object.freeze({
      issuer: config.issuer,
      audience: config.audience,
      subject: config.subject,
      organizationId: config.organizationId,
      expiresAt: config.expiresAt,
    });
    const issuer = new URL(config.issuer);
    if (
      issuer.protocol !== 'https:' ||
      issuer.username ||
      issuer.password ||
      issuer.search ||
      issuer.hash ||
      !config.audience ||
      !config.subject ||
      !uuid.test(config.organizationId) ||
      !Number.isFinite(config.expiresAt) ||
      config.expiresAt <= Date.now() ||
      config.expiresAt > Date.now() + 3600000 ||
      config.keys.length < 1 ||
      config.keys.length > 8
    )
      throw new Error('Approved workload trust policy required');
    for (const { kid, jwk } of config.keys) {
      if (
        !/^[a-zA-Z0-9_-]{1,100}$/.test(kid) ||
        this.keys.has(kid) ||
        jwk.kty !== 'RSA' ||
        jwk.d ||
        jwk.p ||
        jwk.q ||
        jwk.dp ||
        jwk.dq ||
        jwk.qi ||
        jwk.e !== 'AQAB'
      )
        throw new Error('Public workload key required');
      const key = createPublicKey({ key: jwk, format: 'jwk' });
      if ((key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048)
        throw new Error('Workload key too weak');
      this.keys.set(kid, key);
    }
  }
  async authenticate(token: string): Promise<WorkloadIdentity> {
    const p = this.policy;
    if (token.length > 8192 || p.expiresAt <= Date.now())
      throw new Error('Workload identity denied');
    const parts = token.split('.');
    if (
      parts.length !== 3 ||
      parts.some((v) => !v || !/^[a-zA-Z0-9_-]+$/.test(v))
    )
      throw new Error('Workload identity denied');
    const header = providerJson(
      Buffer.from(parts[0], 'base64url').toString('utf8'),
    );
    if (
      !header ||
      header.alg !== 'RS256' ||
      header.typ !== 'JWT' ||
      Object.keys(header).some((k) => !['alg', 'typ', 'kid'].includes(k)) ||
      typeof header.kid !== 'string'
    )
      throw new Error('Workload identity denied');
    const key = this.keys.get(header.kid);
    if (
      !key ||
      !verify(
        'RSA-SHA256',
        Buffer.from(parts[0] + '.' + parts[1]),
        key,
        Buffer.from(parts[2], 'base64url'),
      )
    )
      throw new Error('Workload identity denied');
    const c = providerJson(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (
      !c ||
      c.iss !== p.issuer ||
      c.aud !== p.audience ||
      c.sub !== p.subject ||
      c.organization_id !== p.organizationId ||
      !uuid.test(c.source_id) ||
      !uuid.test(c.jti) ||
      !Number.isSafeInteger(c.iat) ||
      !Number.isSafeInteger(c.exp) ||
      c.exp * 1000 <= Date.now() ||
      c.iat * 1000 > Date.now() + 1000 ||
      c.iat * 1000 < Date.now() - 300000 ||
      c.exp <= c.iat ||
      c.exp - c.iat > 300 ||
      (c.nbf !== undefined &&
        (!Number.isSafeInteger(c.nbf) || c.nbf * 1000 > Date.now()))
    )
      throw new Error('Workload identity denied');
    return Object.freeze({
      issuer: p.issuer,
      audience: p.audience,
      subject: p.subject,
      organizationId: p.organizationId,
      sourceId: c.source_id,
      issuedAt: c.iat * 1000,
      expiresAt: c.exp * 1000,
    });
  }
}
