/** Test-only serialization: opaque admitted identifiers are not phone-number text.
 * Keys and customer-visible text remain byte-for-byte subject to the original regex.
 */
export function privacySerialization(value: unknown): string {
  const identityPath =
    /^(?:organization_id|properties\.\d+\.(?:organization_id|customer_id|location_id|contractor\.id|jobs\.\d+\.(?:job_id|estimate_id|issued_version_id|lines\.\d+\.id)|reports\.\d+\.(?:linked_job_ids\.\d+|report\.(?:reference|(?:checklist|observations)\.\d+\.reference)\.(?:organization_id|customer_id|location_id|report_id|finding_id))))$/;
  const digestPath =
    /^(?:integrity\.sha256|properties\.\d+\.reports\.\d+\.sha256)$/;
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const digest = /^[0-9a-f]{64}$/;
  function visit(v: unknown, path: string[] = []): unknown {
    const field = path.some((part) => part.includes('.')) ? '' : path.join('.');
    if (typeof v === 'string') {
      const identity = identityPath.test(field) && uuid.test(v);
      const hash = digestPath.test(field) && digest.test(v);
      return identity || hash ? v.replaceAll('555010', '<opaque-digits>') : v;
    }
    if (Array.isArray(v))
      return v.map((item, i) => visit(item, [...path, String(i)]));
    if (v && typeof v === 'object')
      return Object.fromEntries(
        Object.entries(v).map(([k, item]) => [k, visit(item, [...path, k])]),
      );
    return v;
  }
  return JSON.stringify(visit(value));
}
