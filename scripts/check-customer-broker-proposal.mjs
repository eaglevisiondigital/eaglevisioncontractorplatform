// Offline source/dependency review only. No credential or transport access.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const hash = (path) =>
  createHash('sha256').update(readFileSync(path)).digest('hex');
const r = JSON.parse(readFileSync('docs/CUSTOMER_BROKER_REVIEW.json', 'utf8'));
if (
  r.hostedApplied !== false ||
  r.operationalReady !== false ||
  r.connectedRoutesEnabled !== false
)
  throw Error('Broker must remain uninstalled/default off');
for (const x of r.sources)
  if (hash(x.file) !== x.sha256) throw Error('Broker review source drift');
if (
  hash('server/customer/requests.proposed.sql') !==
  '6178cee11c81593e3a90d0ef75f6194835019112877f50fc6eb5e692768d44af'
)
  throw Error('Protected4B proposal changed');
for (const file of [
  'server/customer/broker.proposed.sql',
  'server/customer/broker-ownership.proposed.sql',
]) {
  const sql = readFileSync(file, 'utf8').replace(/--[^\n]*/g, '');
  if (
    /\bcreate\s+role\b|\bpassword\b|\bgrant\b[^;]*\bto\s+(?:public|anon|authenticated|service_role)\b|create\s+(?:or replace\s+)?function\s+(?:private\.customer_capability|public\.)/i.test(
      sql,
    )
  )
    throw Error('Unexpected broker activation/provisioning/public grant');
}
console.log(
  'Broker source/ownership review integrity PASS; protected4B unchanged; no hosted/connected authority.',
);
