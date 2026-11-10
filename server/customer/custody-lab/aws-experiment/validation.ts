import {
  bindPackage,
  LIMITS,
  type ExperimentPackage,
  type Policy,
} from './package';
export interface Context {
  action: string;
  resource: string;
  principal?: string;
  values: Record<string, string | boolean | string[] | undefined>;
}
const values = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(String) : v === undefined ? [] : [String(v)];
const wildcard = (pattern: string, value: string) =>
  new RegExp(
    '^' +
      pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') +
      '$',
  ).test(value);
/** Deliberately finite OFFLINE truth table for these templates, NOT AWS IAM simulation. */
export function permitted(policies: Policy[], ctx: Context) {
  let allow = false;
  for (const p of policies)
    for (const s of p.Statement) {
      if (
        !s.Action.some((a) => wildcard(a, ctx.action)) ||
        (s.Resource && !s.Resource.some((r) => wildcard(r, ctx.resource))) ||
        (s.Principal &&
          s.Principal !== '*' &&
          s.Principal.AWS !== ctx.principal)
      )
        continue;
      let match = true;
      for (const [op, terms] of Object.entries(s.Condition ?? {}))
        for (const [key, expected] of Object.entries(terms)) {
          const actual = values(ctx.values[key]),
            want = values(expected);
          let ok: boolean;
          switch (op) {
            case 'StringEquals':
            case 'Bool':
              ok = actual.some((v) => want.includes(v));
              break;
            case 'StringNotEquals':
              ok = !actual.some((v) => want.includes(v));
              break;
            case 'StringLike':
              ok = actual.some((v) => want.some((w) => wildcard(w, v)));
              break;
            case 'ForAllValues:StringLike':
              ok = actual.every((v) => want.some((w) => wildcard(w, v)));
              break;
            case 'ForAllValues:StringEquals':
              ok = actual.every((v) => want.includes(v));
              break;
            case 'ForAnyValue:StringEquals':
              ok = actual.some((v) => want.includes(v));
              break;
            case 'Null':
              ok = want.includes(String(actual.length === 0));
              break;
            case 'DateGreaterThanEquals':
              ok =
                actual.length === 1 &&
                Date.parse(actual[0]) >= Date.parse(want[0]);
              break;
            case 'DateLessThan':
              ok =
                actual.length === 1 &&
                Date.parse(actual[0]) < Date.parse(want[0]);
              break;
            default:
              throw Error(
                'Unsupported offline condition; no permission inferred',
              );
          }
          if (!ok) match = false;
        }
      if (match && s.Effect === 'Deny') return false;
      if (match && s.Effect === 'Allow') allow = true;
    }
  return allow;
}
export function validatePackage(p: ExperimentPackage) {
  const rebuilt = bindPackage(p.bindings);
  if (JSON.stringify(p) !== JSON.stringify(rebuilt))
    throw Error('Package mismatch');
  if (p.bucket.length > 63 || p.bucket.length < 3)
    throw Error('Bucket name length');
  for (const role of ['admin', 'runner', 'reviewer'] as const) {
    if (
      Buffer.byteLength(JSON.stringify(p.permissions[role])) > 10240 ||
      Buffer.byteLength(JSON.stringify(p.trust[role])) > 2048 ||
      p.roles[role].length > 64
    )
      throw Error('IAM size limit');
    if (
      p.permissions[role].Statement.some(
        (s) =>
          s.Principal !== undefined ||
          s.Action.some(
            (a) =>
              a.startsWith('iam:') ||
              a === 'sts:AssumeRole' ||
              a === 's3:BypassGovernanceRetention',
          ) ||
          s.Resource?.some((r) => r === '*'),
      )
    )
      throw Error('Unexpected delegation or resource wildcard');
  }
  if (
    p.manifest.cases.length !== LIMITS.cases ||
    p.manifest.operationalReady !== false ||
    p.executionAuthorized !== false
  )
    throw Error('Scope/authority mismatch');
  return {
    offlineValid: true,
    awsValidated: false,
    executionAuthorized: false,
  };
}
