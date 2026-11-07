// Reviewed source evolution only. No application admission, custody or restore.
import { createHash } from 'node:crypto';
import { cycle25SourcePorts } from './cycle25-source-lineage.mjs';
export const nextParent = '523afd4ef17d5502b6e0e39a4df86bdaa7bba23b';
export const nextAuthors = Object.freeze(
  [
    {
      module: 'field-navigation-ack',
      commit: '94556e2a213bb513264432aa48e97bd3a94184d2',
      modified: ['src/lib/workflows/field-workspace.ts'],
      added: [
        'docs/program/V1_FIELD_NAVIGATION_ACK.md',
        'tests/v1-field-navigation-ack.test.ts',
      ],
      companions: [
        {
          path: 'src/components/workflows/FieldWorkspace.tsx',
          publisher: '23829f2995b113eb5426b0a5328e12624efd3be5',
          sha256:
            'f7611e9f0f15448af624e595803fd94f903aed668a29ead321b395061fdf5268',
        },
        {
          path: 'src/components/workflows/field-workspace.css',
          publisher: '23829f2995b113eb5426b0a5328e12624efd3be5',
          sha256:
            'e3538ebdf894a0e798c6cc9b54a6b84e274b7ff0b5a6fa5a30611d0f0456c54f',
        },
        {
          path: 'tests/cycle17-field-workspace.test.ts',
          publisher: '23829f2995b113eb5426b0a5328e12624efd3be5',
          sha256:
            '7a13c5fae9bb21f83c7bb4f5577cfe6a80c69b28f91d80695df76ae8c1988e6f',
        },
        {
          path: 'docs/program/CYCLE17_FIELD_WORKSPACE.md',
          publisher: '23829f2995b113eb5426b0a5328e12624efd3be5',
          sha256:
            'e1892f929ed87bba54e26ad23b88d5546f3e5da75c7277a7d71d68084784198d',
        },
      ],
    },
    {
      module: 'finance-retained-selection',
      commit: '08ad85d896e3988be1ba223cb0c719374cdfbe7e',
      modified: [
        'src/lib/workflows/recorded-cost-requirements.ts',
        'src/lib/workflows/cost-coverage-actions.ts',
      ],
      added: [
        'docs/program/V1_FINANCE_RETAINED_SELECTION.md',
        'tests/v1-finance-retained-selection.test.ts',
      ],
      companions: [
        {
          path: 'src/components/workflows/RecordedCostRequirements.tsx',
          publisher: 'a3c8a39dd1b08ffdc68d1f7b9b29153ae50feb88',
          sha256:
            '7374d98abfb7751913e7c502835e608666a1644776dcf5e0c06056e9dca2b967',
        },
        {
          path: 'src/components/workflows/recorded-cost-requirements.css',
          publisher: 'a3c8a39dd1b08ffdc68d1f7b9b29153ae50feb88',
          sha256:
            '8369a7d02611e3ebd214a160a29ed754d374becdd6e6ea561079da1bb96a6b4e',
        },
        {
          path: 'tests/cycle23-recorded-cost-requirements.test.ts',
          publisher: 'a3c8a39dd1b08ffdc68d1f7b9b29153ae50feb88',
          sha256:
            '03a00b5966584b69642117f219497ff5e6eb0a774b0d4317cab6d5e48a7839e7',
        },
        {
          path: 'docs/program/CYCLE23_RECORDED_COST_REQUIREMENTS.md',
          publisher: 'a3c8a39dd1b08ffdc68d1f7b9b29153ae50feb88',
          sha256:
            'f59becfd5d4a5f30b59ea28a46c8f701d743ccda62eafe4ea3ceaa9d773d8d3c',
        },
        {
          path: 'tests/cycle33-recorded-cost-selector-custody.test.ts',
          publisher: '5986df744d688d7ab2e72a7824b18e4568d1cb92',
          sha256:
            'e78790aa2eb07b1876181e7b6b329640f67b2f1ca740ceb968c78a569c9040ba',
        },
        {
          path: 'docs/program/CYCLE33_RECORDED_COST_SELECTOR_CUSTODY.md',
          publisher: '5986df744d688d7ab2e72a7824b18e4568d1cb92',
          sha256:
            '76d7a8f891e47ac08b56961f8ba6434f754d0d39d87f6536d84bb822540637c6',
        },
        {
          path: 'docs/program/CYCLE24_COST_COVERAGE_ACTIONS.md',
          publisher: '660439228b66f19bd80b80cffb7ccda127bdf699',
          sha256:
            'a5008fd6c83ce95d2b62c96ad07ac92316973437cf69a6f8f9f4e2f53b362d30',
        },
        {
          path: 'tests/cycle24-cost-coverage-actions.test.ts',
          publisher: '660439228b66f19bd80b80cffb7ccda127bdf699',
          sha256:
            'af1cd4619104ddb5ca482e281ab663239156b95acfb258b741dcc747448008f2',
        },
        {
          path: 'docs/program/CYCLE25_NATIVE_COST_RECONCILIATION.md',
          publisher: '23d1dceac734419fb85221eb46d079f4b641b4cb',
          sha256:
            '778a5e1b746aeb8f59c22138d8f9aecf5134cee9febd54f49cedf33f81b52ece',
        },
        {
          path: 'tests/cycle25-native-cost-reconciliation.test.ts',
          publisher: '23d1dceac734419fb85221eb46d079f4b641b4cb',
          sha256:
            'dd8a70820922f50f074289eb74f3fb2baa4b57ae7165272364fdd872d3220612',
        },
        {
          path: 'docs/program/CYCLE26_FINANCIAL_COVERAGE.md',
          publisher: '6031e03eff0dfe31c1b8a8cfea4dc5bd92321c51',
          sha256:
            '59db7279523580f6542a8822d32c5ce6b3a2e217c462353f37e76a9c042ae1e6',
        },
        {
          path: 'tests/cycle26-financial-coverage.test.ts',
          publisher: '6031e03eff0dfe31c1b8a8cfea4dc5bd92321c51',
          sha256:
            'a424eaffaeb645dab3556fce26035e418232dbbf71a0f4a3d19ebc63ed9817c4',
        },
        {
          path: 'docs/program/CYCLE27_COST_COMPLETENESS.md',
          publisher: '09569d2458f51f2b67d637d2ade1943071992240',
          sha256:
            'e7cef1b8fc331eb3bc59dd2ceabfe3a2ecccc9fc75724e2926220617c51910c4',
        },
        {
          path: 'tests/cycle27-cost-completeness.test.ts',
          publisher: '09569d2458f51f2b67d637d2ade1943071992240',
          sha256:
            'e09606d58ef646c5fd5843e61a96e8ddbdb206cbbcfdd8c9dea009ed884b97f3',
        },
        {
          path: 'docs/program/CYCLE29_COST_CONTINUITY.md',
          publisher: '9eaca7692767590e263c53b3757e8f3a4221b408',
          sha256:
            'e690d203b2589da188a1af48b8d9fd794623899173001d42957ff356e74e70f2',
        },
        {
          path: 'tests/cycle29-cost-continuity.test.ts',
          publisher: '9eaca7692767590e263c53b3757e8f3a4221b408',
          sha256:
            '0e6cb2953aefefb08a672ec768eefc9457fcf0e25bde6c9e1f46d4e54f69aea7',
        },
        {
          path: 'src/components/workflows/CostCoverageActions.tsx',
          publisher: '9577069c3788a7baf7202f55e496e66352ad298e',
          sha256:
            '36b662b7afc21718bd73d9845ee0eaf45746d76855b4ec4a9d70ac37198fb572',
        },
        {
          path: 'src/components/workflows/cost-coverage-actions.css',
          publisher: '249925491c3fdf3191329596409d7a6f31582019',
          sha256:
            'a068b48e0d8e4af91f9654cae8baad604428ca3ec9732ac32617f6031a1527d6',
        },
        {
          path: 'docs/program/CYCLE28_COST_READINESS.md',
          publisher: '9577069c3788a7baf7202f55e496e66352ad298e',
          sha256:
            '1554571d0c65905e59a5a2aaad5cbaf1f8d3d3e677017835e0c745222e5f608f',
        },
        {
          path: 'tests/cycle28-cost-readiness.test.ts',
          publisher: '9577069c3788a7baf7202f55e496e66352ad298e',
          sha256:
            'da27aefd48df61223991666f90c5b97b5dffdf379904c71943f7b3d5d178ba21',
        },
      ],
    },
  ].map((a) =>
    Object.freeze({
      ...a,
      modified: Object.freeze(a.modified),
      added: Object.freeze(a.added),
      companions: Object.freeze(a.companions.map(Object.freeze)),
    }),
  ),
);
const same = (a, b) => Buffer.from(a).equals(Buffer.from(b));
const hash = (b) => createHash('sha256').update(b).digest('hex');
export function admitNextNative(path, current, previous, supplied = {}) {
  const a = nextAuthors.find((a) => a.modified.includes(path));
  if (!a) throw Error('No finite next native source owner');
  const p = { ...cycle25SourcePorts, ...supplied };
  if (
    p.type(a.commit) !== 'commit' ||
    p.type(nextParent) !== 'commit' ||
    p.parent(a.commit) !== nextParent
  )
    throw Error('Exact sole523 author required');
  const expected = [
    ...a.modified.map((p) => 'M\t' + p),
    ...a.added.map((p) => 'A\t' + p),
  ]
    .sort()
    .join('\n');
  if (p.delta(a.commit) !== expected)
    throw Error('Exact next author delta required');
  if (!same(previous, p.git(nextParent, path)))
    throw Error('Previously validated exact523 endpoint required');
  for (const f of [...a.modified, ...a.added])
    if (
      p.mode(a.commit, f) !== '100644' ||
      !same(p.read(f), p.git(a.commit, f))
    )
      throw Error('Complete exact new author bundle required');
  if (!same(current, p.git(a.commit, path)) || same(current, previous))
    throw Error('Exact changed next native endpoint required');
  for (const f of a.companions)
    if (
      p.type(f.publisher) !== 'commit' ||
      p.mode(f.publisher, f.path) !== '100644' ||
      p.mode(nextParent, f.path) !== '100644' ||
      hash(p.git(f.publisher, f.path)) !== f.sha256 ||
      hash(p.git(nextParent, f.path)) !== f.sha256 ||
      hash(p.read(f.path)) !== f.sha256
    )
      throw Error('Exact immutable native companions required');
  for (const f of [...a.added, ...a.modified])
    if (!same(p.read(f), p.git(a.commit, f)))
      throw Error('Next native bundle changed during validation');
  for (const f of a.companions)
    if (hash(p.read(f.path)) !== f.sha256)
      throw Error('Native companion changed during validation');
  if (!same(current, p.read(path)))
    throw Error('Final fresh next native endpoint required');
  return {
    path,
    source_commit: a.commit,
    module: a.module,
    authority: 'SOURCE_LINEAGE_ONLY_NOT_BUSINESS_RESTORE',
    business_authority: false,
    restore_adapter: false,
  };
}
export function admitNextFieldPublished(
  file,
  current,
  published,
  supplied = {},
) {
  const path = 'src/lib/workflows/field-workspace.ts',
    old = '682306378cd16d8cde94ab153633b1621f44d3696d6f7b2743e57d33116f97f8',
    publisher = '23829f2995b113eb5426b0a5328e12624efd3be5';
  if (file?.path !== path || file.sha256 !== old || published !== publisher)
    throw Error('Original literal C17 Field publication required');
  const p = { ...cycle25SourcePorts, ...supplied };
  if (
    p.type(publisher) !== 'commit' ||
    p.parent(publisher) !== '5aca826003c422b05c625262eb4e7e45fdc9d559' ||
    p.mode(publisher, path) !== '100644' ||
    hash(p.git(publisher, path)) !== old ||
    hash(p.git(nextParent, path)) !== old
  )
    throw Error('Exact original Field publisher and523 predecessor required');
  return admitNextNative(path, current, p.git(publisher, path), p);
}
