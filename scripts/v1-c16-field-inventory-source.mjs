// Exact reviewed test-source lineage. No application or operational authority.
import { createHash } from 'node:crypto';
import { ports as sourcePorts } from './v1-field-source-admission.mjs';

export const fieldInventoryAuthor = '77ff8d00c4659ab8d5054805f7c59e7752c11419';
export const fieldInventoryParent = '9b2864feda8f766bec84f7e710fe0be5c534bf45';
export const fieldInventoryPath = 'tests/cycle16-integration.test.ts';
export const fieldInventoryDoc = 'docs/program/V1_C16_FIELD_INVENTORY.md';
const originalPublisher = 'd62aa76ae03d64863c12dc92ce6f030e37974518';
const oldAuthor = '8e634b247e09ee589d3a797f5fbfb4651c7146e5';
const oldParent = '3660a7e6e3d260f0cef54200f723074278f155d7';
const publishedHash =
  'e92bf92bf96a87b7005ab715406ae424e2f2ccb4ec28da45a3cfc14412f4b247';
const publishedBlob = 'f5ba8b49ff15520dc6170fac1e2984d6f80b382d';
const oldHash =
  '4390f6bf0595f4cd7b34bba2d2364fba80748e0227a36dc28dd897f417e53fd5';
const oldBlob = '0ce51ed8d35be7406f044896a6b89fa10d15cd39';
const newHash =
  'bce39cd515190a1c93c7841ec3aea25f0acc7f140dc711eb31b7624d455abdba';
const docHash =
  '5bac77899fef636a605f729cf7ddb57eacd8f268840d0f0821a89850970fd923';
const indexPath = 'docs/program/CYCLE16_DELIVERY_INDEX.json';
const indexHash =
  '8cf7783a93dfb523b175bc793813ea28c3ab4dacbadc45453e09317d7da045be';
const hash = (b) => createHash('sha256').update(b).digest('hex');
const blob = (b) =>
  createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex');
const same = (a, b) => Buffer.from(a).equals(Buffer.from(b));

export function admitFieldInventorySource(
  file,
  current,
  previous,
  supplied = {},
) {
  const captured = Buffer.from(current),
    prior = Buffer.from(previous);
  const p = { ...sourcePorts, ...supplied };
  if (
    !file ||
    JSON.stringify(Reflect.ownKeys(file).sort()) !==
      JSON.stringify(['path', 'sha256']) ||
    file.path !== fieldInventoryPath ||
    file.sha256 !== publishedHash
  )
    throw Error('Exact immutable original C16 inventory metadata required');
  if (
    [
      originalPublisher,
      oldAuthor,
      oldParent,
      fieldInventoryParent,
      fieldInventoryAuthor,
    ].some((c) => p.type(c) !== 'commit') ||
    p.parent(oldAuthor) !== oldParent ||
    p.delta(oldAuthor) !== `M\t${fieldInventoryPath}` ||
    p.parent(fieldInventoryAuthor) !== fieldInventoryParent ||
    p.delta(fieldInventoryAuthor) !==
      [`A\t${fieldInventoryDoc}`, `M\t${fieldInventoryPath}`]
        .sort()
        .join('\n') ||
    [
      originalPublisher,
      oldParent,
      oldAuthor,
      fieldInventoryParent,
      fieldInventoryAuthor,
    ].some((c) => p.mode(c, fieldInventoryPath) !== '100644') ||
    p.mode(fieldInventoryAuthor, fieldInventoryDoc) !== '100644'
  )
    throw Error(
      'Exact original and sole-parent M1/A1 inventory history required',
    );
  const published = Buffer.from(p.git(originalPublisher, fieldInventoryPath));
  const old = Buffer.from(p.git(oldAuthor, fieldInventoryPath));
  if (
    hash(published) !== publishedHash ||
    blob(published) !== publishedBlob ||
    !same(published, p.git(oldParent, fieldInventoryPath)) ||
    hash(old) !== oldHash ||
    blob(old) !== oldBlob ||
    !same(prior, old) ||
    !same(p.git(fieldInventoryParent, fieldInventoryPath), old)
  )
    throw Error(
      'Original C16 publisher and reviewed predecessor must remain exact',
    );
  for (const c of [oldParent, fieldInventoryParent, fieldInventoryAuthor])
    if (
      p.mode(c, indexPath) !== '100644' ||
      hash(p.git(c, indexPath)) !== indexHash
    )
      throw Error('Immutable original C16 index required');
  const reviewed = Buffer.from(p.git(fieldInventoryAuthor, fieldInventoryPath));
  const doc = Buffer.from(p.git(fieldInventoryAuthor, fieldInventoryDoc));
  if (
    hash(reviewed) !== newHash ||
    hash(doc) !== docHash ||
    !same(captured, reviewed)
  )
    throw Error(
      'Only the exact reviewed Field inventory source and note admitted',
    );
  for (let i = 0; i < 2; i++)
    if (
      !same(p.read(fieldInventoryPath), reviewed) ||
      !same(p.read(fieldInventoryDoc), doc) ||
      hash(p.read(indexPath)) !== indexHash
    )
      throw Error(
        'Fresh exact inventory source, note and original index required',
      );
  const finalEndpoint = Buffer.from(p.read(fieldInventoryPath));
  if (
    !same(finalEndpoint, captured) ||
    !same(current, captured) ||
    !same(previous, prior)
  )
    throw Error('Final exact inventory inputs and current source required');
  return {
    module: 'cycle16-field-inventory-test-compatibility',
    source_commit: fieldInventoryAuthor,
    path: fieldInventoryPath,
    authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
    business_authority: false,
    restore_adapter: false,
  };
}
