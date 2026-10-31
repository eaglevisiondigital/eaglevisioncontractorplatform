/** Exact approved provider DNS records, obtained through account-bound domain
 * configuration review. A domain string or arbitrary existing SPF is not proof. */
export interface ApprovedSenderDns {
  domain: string;
  spf: { name: string; value: string };
  dkim: { name: string; value: string };
  dmarc: { name: string; value: string };
}
export async function verifyApprovedSenderDns(
  domain: string,
  configuration: ApprovedSenderDns,
  resolveTxt: (name: string) => Promise<string[][]>,
) {
  const config = structuredClone(configuration);
  if (
    domain !== config.domain ||
    !/^([a-z0-9-]+\.)+[a-z]{2,63}$/.test(domain) ||
    !config.spf.value.startsWith('v=spf1 ') ||
    /\s\+?all(?:\s|$)/.test(config.spf.value) ||
    !/^v=DKIM1;/.test(config.dkim.value) ||
    !/^v=DMARC1;/.test(config.dmarc.value) ||
    !/(?:^|;)\s*p=(?:quarantine|reject)(?:;|$)/.test(config.dmarc.value)
  )
    throw new Error('Approved authenticated DNS configuration required');
  for (const record of [config.spf, config.dkim, config.dmarc]) {
    if (
      !(record.name === domain || record.name.endsWith('.' + domain)) ||
      !/^[a-zA-Z0-9_.-]{1,253}$/.test(record.name) ||
      record.value.length > 4096 ||
      /[\r\n]/.test(record.value)
    )
      throw new Error('DNS tenant scope denied');
  }
  if (
    config.dmarc.name !== `_dmarc.${domain}` ||
    !config.dkim.name.includes('._domainkey.')
  )
    throw new Error('DNS authentication labels required');
  async function check(
    record: { name: string; value: string },
    prefix: string,
  ) {
    let result: string[][];
    try {
      result = await resolveTxt(record.name);
    } catch {
      throw new Error('DNS verification unavailable');
    }
    if (
      result.length > 64 ||
      result.some((parts) => parts.length > 64 || parts.join('').length > 4096)
    )
      throw new Error('DNS response limit');
    const candidates = result
      .map((parts) => parts.join(''))
      .filter((value) => value.startsWith(prefix));
    return candidates.length === 1 && candidates[0] === record.value;
  }
  const [spf, dkim, dmarc] = await Promise.all([
    check(config.spf, 'v=spf1'),
    check(config.dkim, 'v=DKIM1'),
    check(config.dmarc, 'v=DMARC1'),
  ]);
  return Object.freeze({ domain, spf, dkim, dmarc, checkedAt: Date.now() });
}
