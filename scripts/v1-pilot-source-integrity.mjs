// Finite reviewed Git source provenance only. Never business custody or restore.
import { createHash } from 'node:crypto';
import { cycle25SourcePorts } from './cycle25-source-lineage.mjs';

export const pilotParent = '2d93b629d746f530ed1e3268631ca72d1651e85f';
export const pilotAuthors = Object.freeze([
  Object.freeze({
    path: 'src/lib/workflows/service-passport-desk.ts',
    commit: '4151bbcfa3d049d0cc0a895487a0a51ff066c49d',
    added: Object.freeze([
      'docs/program/V1_PASSPORT_FINAL_AUTHORITY.md',
      'tests/v1-passport-final-authority.test.ts',
    ]),
  }),
  Object.freeze({
    path: 'src/lib/program/trade-editions.ts',
    commit: '96163eed882501d0463b299105cede42cc7109a4',
    added: Object.freeze([
      'docs/program/V1_TRADE_FINAL_AUTHORITY.md',
      'tests/v1-trade-final-authority.test.ts',
    ]),
  }),
]);
const passportPublisher = '97272beef9dbd5fd26da7861961aed8c99b68a2b';
const passportOriginal =
  'b235dc62e3b6e3f0eceed01af3c36ce94fbf1c2d274b1e5f219abef7d9b73f53';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const same = (a, b) => Buffer.from(a).equals(Buffer.from(b));
const companions = Object.freeze({
  'docs/program/CYCLE13_SERVICE_PASSPORT_DESK.md':
    'fd26958fb234e944e83fc0607aa112cc92bb0d4d25f0e825038f90fe7e1144d3',
  'src/components/workflows/ServicePassportDesk.tsx':
    '58a700754724e41945781e068e767ed971c38c9dec013f270cc96381630ea368',
  'src/components/workflows/service-passport-desk.css':
    'cb7b87f1b3ad7145d7b6fe9bfe2d95078fd1888ef300c3cdf49e854c48584506',
  'tests/cycle13-service-passport-desk.test.ts':
    'c49866ffabe879784c8340f86e76d31d5564a7119d9cff46076ded15f252f6af',
});

export function inspectPilotAuthor(path, current, supplied = {}) {
  const spec = pilotAuthors.find((row) => row.path === path);
  if (!spec) throw Error('No finite pilot source owner');
  const ports = { ...cycle25SourcePorts, ...supplied };
  if (
    ports.type(spec.commit) !== 'commit' ||
    ports.type(pilotParent) !== 'commit' ||
    ports.parent(spec.commit) !== pilotParent
  )
    throw Error('Exact single-parent pilot author required');
  const expected = [`M\t${path}`, ...spec.added.map((p) => `A\t${p}`)]
    .sort()
    .join('\n');
  if (ports.delta(spec.commit) !== expected)
    throw Error('Exact M1/A2 pilot author delta required');
  for (const p of [path, ...spec.added]) {
    if (ports.mode(spec.commit, p) !== '100644')
      throw Error('Regular non-executable pilot source required');
    const authored = ports.git(spec.commit, p);
    if (!same(ports.read(p), authored))
      throw Error(`Exact current pilot author bytes required: ${p}`);
  }
  if (
    !same(current, ports.git(spec.commit, path)) ||
    !same(current, ports.read(path))
  )
    throw Error('Exact freshly read pilot endpoint required');
  if (same(current, ports.git(pilotParent, path)))
    throw Error('Pilot correction absent');
  for (const p of [...spec.added, path])
    if (!same(ports.read(p), ports.git(spec.commit, p)))
      throw Error('Pilot source bundle changed during inspection');
  return {
    source_commit: spec.commit,
    authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
    business_authority: false,
    restore_adapter: false,
  };
}

export function admitPilotPassportPublished(file, current, supplied = {}) {
  if (file?.path !== pilotAuthors[0].path || file.sha256 !== passportOriginal)
    throw Error('Original literal Cycle13 Passport pin required');
  const ports = { ...cycle25SourcePorts, ...supplied };
  if (
    ports.type(passportPublisher) !== 'commit' ||
    ports.parent(passportPublisher) !==
      'c41a2424a0bd098905fd60965ef7f78447f1c753'
  )
    throw Error('Original Cycle13 publisher history required');
  for (const [path, digest] of [
    [file.path, passportOriginal],
    ...Object.entries(companions),
  ]) {
    if (
      ports.mode(passportPublisher, path) !== '100644' ||
      ports.mode(pilotParent, path) !== '100644' ||
      hash(ports.git(passportPublisher, path)) !== digest ||
      hash(ports.git(pilotParent, path)) !== digest ||
      (path !== file.path && hash(ports.read(path)) !== digest)
    )
      throw Error('Exact original Passport publisher and companions required');
  }
  const result = inspectPilotAuthor(file.path, current, ports);
  for (const [path, digest] of Object.entries(companions))
    if (hash(ports.read(path)) !== digest)
      throw Error('Original Passport companion changed during inspection');
  if (!same(current, ports.read(file.path)))
    throw Error('Passport endpoint changed during inspection');
  return result;
}
