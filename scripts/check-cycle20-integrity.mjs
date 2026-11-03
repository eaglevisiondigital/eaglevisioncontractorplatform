import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { readCycle13File } from './check-cycle13-integrity.mjs';

// Source pins are calculated from exact published author Git blobs, not working-tree claims.
const admittedAuthors = [
  {
    module: 'work-order-evidence-continuity',
    component: 'WorkOrderEvidenceContinuity',
    owner: '/root/cycle11_field_growth',
    branch: 'codex/cycle20-work-order-source-evidence',
    parent_commit: '88ecc8761735f00fcc2bb580dad418f5e46b81c6',
    head_commit: '97a152651c8783646a6dcd456c815128825eeae7',
    pr_head_commit: '077187201ebe3d5eea2905a3db949e57f7727147',
    draft_pr: 139,
    focused_new_tests: 39,
    status: 'LOCAL_TESTED_DEFAULT_OFF_NOT_OPERATIONAL',
    owned_files: [
      {
        path: 'src/lib/workflows/work-order-evidence-continuity.ts',
        sha256:
          'f5590db477e6c48c44da2db6427894a62ef400b64be961df93027fcdf3368f1f',
        blob: '21018fb2c20efbdb3026362a84100225b1741e5f',
      },
      {
        path: 'src/components/workflows/WorkOrderEvidenceContinuity.tsx',
        sha256:
          '6d889734823e6ee6aa0c3d360e0f8e884f13cb0e4d846292cfa22259bc7dc37d',
        blob: '0b7d6fea521676a751bcac7cee2047c9cdbff404',
      },
      {
        path: 'src/components/workflows/work-order-evidence-continuity.css',
        sha256:
          'c7d51c1d82c86a18ddacf5d3036e0619714713df1993946356dd8403d8dbad88',
        blob: '732104db8610bec0be6f15f486eb37005e045ce1',
      },
      {
        path: 'tests/cycle20-work-order-evidence-continuity.test.ts',
        sha256:
          '14bea01ecb02198f24172d2807ff009191c2aee5425b07dd85c2e92379a91b8a',
        blob: '49ee4738b259f5a9a027b1fa7397b5a09556d9dd',
      },
      {
        path: 'docs/program/CYCLE20_WORK_ORDER_EVIDENCE_CONTINUITY.md',
        sha256:
          '4b7b4d0733fe8b4c6b3b42af0b5d4cfeb139acc0cd9043d3197dbd20151c5b3b',
        blob: '6737ff8bd2543ca10e321ee3be43653f27d731d4',
      },
    ],
  },
  {
    module: 'recorded-cost-continuity',
    component: 'RecordedCostContinuity',
    owner: '/root/cycle17_finance_intelligence',
    branch: 'codex/cycle20-recorded-cost-source-review',
    parent_commit: '88ecc8761735f00fcc2bb580dad418f5e46b81c6',
    head_commit: '6b3c8c3f86fb3dda498a643991391d1c20aac39d',
    pr_head_commit: 'f3f6b67e33358a34c297f3c19cfca0ad21f8b21d',
    draft_pr: 142,
    focused_new_tests: 47,
    status: 'LOCAL_TESTED_DEFAULT_OFF_NOT_OPERATIONAL',
    owned_files: [
      {
        path: 'src/lib/workflows/recorded-cost-continuity.ts',
        sha256:
          '7bcccc150806a40605ed4045b5673555a06da2c0e2ec7cb0bd89d6909f57c03f',
        blob: '387492d1914a1bd8ffa255703ed9f64a234e37fb',
      },
      {
        path: 'src/components/workflows/RecordedCostContinuity.tsx',
        sha256:
          '52da5881356d45bdc8c5586d03cc095aeb6cb6f0d3fd4334305265cb01ccf712',
        blob: '1ae2ed001e49049d7b30e8951332a2e67a1fce5a',
      },
      {
        path: 'src/components/workflows/recorded-cost-continuity.css',
        sha256:
          'c60e6779a40fbf64b31c92445974f01ad3bcdc5529581beed8bb9035661ea554',
        blob: '1489b422a701631b5662a07945595ffabc868d8c',
      },
      {
        path: 'tests/cycle20-recorded-cost-continuity.test.ts',
        sha256:
          'dac2709437d3a0a36d4497899105dfe78593f16a6d4f189e66eba3e9c92c830a',
        blob: '4f4557805531e244502ca076d3dcdcc37fb2edb0',
      },
      {
        path: 'docs/program/CYCLE20_RECORDED_COST_CONTINUITY.md',
        sha256:
          'c95d5e629bbeafabdf96a25c7f5ab550c4e6c5ae1be8ac4a7601ffb2462473bb',
        blob: '76bed1f5a8ffa163477fb0e3518dc38a7a1cdc8b',
      },
    ],
  },
  {
    module: 'published-service-continuity',
    component: 'PublishedServiceContinuity',
    owner: '/root/cycle13_customer_advanced',
    branch: 'codex/cycle20-published-service-source-review',
    parent_commit: '88ecc8761735f00fcc2bb580dad418f5e46b81c6',
    head_commit: 'f5b342b6afef7b294a19d33502cf30d9f58e2e7e',
    pr_head_commit: 'eb3406a4c4880107c740d39cb370cceb3ea2e4a3',
    draft_pr: 138,
    focused_new_tests: 53,
    status: 'LOCAL_TESTED_DEFAULT_OFF_NOT_OPERATIONAL',
    owned_files: [
      {
        path: 'src/lib/workflows/published-service-continuity.ts',
        sha256:
          'e6edb14442670d1a4f72253485741fe7ef40ddd19b80e2e890a309b997b06652',
        blob: '04e3cf7873dbfa62eb2e621bebd24b926780f0d9',
      },
      {
        path: 'src/components/workflows/PublishedServiceContinuity.tsx',
        sha256:
          '45d0bb3481e4842ea3f7f2da50254fa9d50581d6645b8125793c1342073fa87f',
        blob: '0b206b1664cbef3d22c64f8bf35ac2b08f5dcb55',
      },
      {
        path: 'src/components/workflows/published-service-continuity.css',
        sha256:
          'fd0a926707db5a5508d99b5fa0cccf9d51d185a540b0a6b0bde66bde26864c29',
        blob: 'ab792337e6327bef140ce83f21523b75da70b503',
      },
      {
        path: 'tests/cycle20-published-service-continuity.test.ts',
        sha256:
          'ac3714d1488674672a17f82eeda653490f2997fed1bfe77c38072b6d4023a516',
        blob: '392c851f7fbea21e3d3352f7c6db784e1ec92773',
      },
      {
        path: 'docs/program/CYCLE20_PUBLISHED_SERVICE_CONTINUITY.md',
        sha256:
          'eb2cfde3d8065d182f15629beef265a36fb2c96ff43aad9b7a6e0b614f11c0d0',
        blob: 'ea22cddbf501a4ae0b8f82c98473cb1021e45fd4',
      },
    ],
  },
  {
    module: 'maintenance-renewal-evidence',
    component: 'MaintenanceRenewalEvidence',
    owner: '/root/cycle11_field_growth',
    branch: 'codex/cycle20-maintenance-renewal-source-review',
    parent_commit: '88ecc8761735f00fcc2bb580dad418f5e46b81c6',
    head_commit: '153416369729fd34a014cb0929f327c0c176bb61',
    pr_head_commit: 'a7961bfe5a853bb822ddac65ba35dd2d3f029f0d',
    draft_pr: 140,
    focused_new_tests: 38,
    status: 'LOCAL_TESTED_DEFAULT_OFF_NOT_OPERATIONAL',
    owned_files: [
      {
        path: 'src/lib/workflows/maintenance-renewal-evidence.ts',
        sha256:
          'cc79b03b2826dbf79a0c3d4772b93275b6a5e14096bdac22d2cce8e6eefbdeb7',
        blob: '249b796d84a8315cc16bcac676ef7193a5732519',
      },
      {
        path: 'src/components/workflows/MaintenanceRenewalEvidence.tsx',
        sha256:
          '7eeba682350c7d5a9aae5c77b67313568e0036b936af543f4fe856f1a26190c4',
        blob: '462fd114568adb0495fba3e510de7c15558c1e9c',
      },
      {
        path: 'src/components/workflows/maintenance-renewal-evidence.css',
        sha256:
          '3fdf1f7f46c8026e183d56bff1ae218a3af2917fda44071e3afe603e6571a217',
        blob: 'bb88cc1be46cc72b8c8adfacdead57d5b4177629',
      },
      {
        path: 'tests/cycle20-maintenance-renewal-evidence.test.ts',
        sha256:
          'c1a1984e9dac62df9029a330544ef9160a31c5181281da6ad5091cf62f41a944',
        blob: '801e46d55d38404c7b3aa5ca690fae25fee1526e',
      },
      {
        path: 'docs/program/CYCLE20_MAINTENANCE_RENEWAL_EVIDENCE.md',
        sha256:
          'b92e46e463a1e08f8afcd8d9a4539ca656672b53e88501387d8a04f7d3e87e6f',
        blob: '568b38617b29188574d019001fb0644504bf8c26',
      },
    ],
  },
  {
    module: 'recorded-priority-navigation',
    component: 'RecordedPriorityNavigation',
    owner: '/root/cycle17_finance_intelligence',
    branch: 'codex/cycle20-priority-source-navigation',
    parent_commit: '88ecc8761735f00fcc2bb580dad418f5e46b81c6',
    head_commit: '9b28117342b72e6fb20aca5fe09966755b8759c6',
    pr_head_commit: 'f925e83ccd1b82ea28242731189181bcaee11605',
    draft_pr: 141,
    focused_new_tests: 42,
    status: 'LOCAL_TESTED_DEFAULT_OFF_NOT_OPERATIONAL',
    owned_files: [
      {
        path: 'src/lib/workflows/recorded-priority-navigation.ts',
        sha256:
          'b500bf0c9d5c3457d2e675533a10dd1d647ba26d1c10aeb23c4b17e925b80d30',
        blob: '3535123047f687b00efb4bb0a545594f600dbd10',
      },
      {
        path: 'src/components/workflows/RecordedPriorityNavigation.tsx',
        sha256:
          'c2913cc1c465b6645d5d916c17c91e3b277d381726f654d3c7f5a46d111202f7',
        blob: 'ee5c1f8ae21c4ef739495fa72d3bc35ccd32bf7f',
      },
      {
        path: 'src/components/workflows/recorded-priority-navigation.css',
        sha256:
          'e58f101c76909e1bbe367062539d55d11d81149f0d04a5fba4e73f2da430c3b3',
        blob: 'ea26109b1786c4a5f9aaa9ad37671e72c8a5380a',
      },
      {
        path: 'tests/cycle20-recorded-priority-navigation.test.ts',
        sha256:
          'ae9e4827dce31a2e92f2d79a66e358822d3a1c51d6e18805442044cf80042fc1',
        blob: '173215cf099e84f351d8b3096e8a700df2debec4',
      },
      {
        path: 'docs/program/CYCLE20_RECORDED_PRIORITY_NAVIGATION.md',
        sha256:
          'c41287cf0ab05054d20d99209423499780247d7cd67398e3c0ef3b44f0d3716a',
        blob: '1736c7a7e944782e8b6bd714481bdb7e72879c2b',
      },
    ],
  },
];
export const cycle20Packages = Object.freeze(
  admittedAuthors.map((p) => Object.freeze([p.module, p.component])),
);
// Exact forward commits preserve the five published author files and add only
// Main's existing `void _;` test-lint correction, without rewriting history.
const sharedLintFix = {
  path: 'tests/cycle20-saved-evidence-runtime.test.ts',
  sha256: '8796fa2e006e0a33fba1b85a235c6be748e93629bdc3fad820e7c18239113d42',
  blob: '291bf9d83af4d09292781e4608f540889b11cfb0',
};
const admittedReview = {
  commit: 'a57928e0abb6d9c7cca1d10fae2d508b643de288',
  files: [
    {
      path: 'tests/cycle20-independent-integration-review.test.ts',
      sha256:
        '361e3f8c28658c724e26dda4080f8b2ce74e5d5caed50e33509ed25931e52513',
      blob: '393bc0715dc965a8a3c26c90fba7646cdd4f41c8',
    },
    {
      path: 'docs/program/CYCLE20_INDEPENDENT_REVIEW.json',
      sha256:
        '5a7123be3878505a30cb4eb82e2f1161b8e3e909ad772d5810c96847bccdfe84',
      blob: '9d8fbdf95e5463ea9fed4839afbf76d5fd5cfea0',
    },
  ],
};
export function validateCycle20Manifest(manifest, read = readCycle13File) {
  if (
    !manifest ||
    manifest.schema !== 'propel-cycle20-sources-v1' ||
    manifest.parent_commit !== '13977f8c870fb57a94ec7f8c4d73768b3083819f' ||
    manifest.support_commit !== '88ecc8761735f00fcc2bb580dad418f5e46b81c6' ||
    manifest.coordination_branch !== 'codex/program-cycle-twenty' ||
    manifest.coordination_draft_pr !== 137 ||
    manifest.release !== 'NOT_READY_NOT_AUTHORIZED' ||
    !['PENDING', 'CLEAR_LOCAL_SYNTHETIC_ONLY'].includes(
      manifest.independent_status,
    ) ||
    !Array.isArray(manifest.packages) ||
    manifest.packages.length !== 5
  )
    throw Error(
      'Exact five C20 source packages, support seed and closed release required',
    );
  const prior = new Set(
    [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19].flatMap((c) =>
      JSON.parse(
        read(`docs/program/CYCLE${c}_DELIVERY_INDEX.json`),
      ).packages.flatMap((p) => p.owned_files.map((f) => f.path)),
    ),
  );
  if (prior.size !== 423)
    throw Error('Exact retained423 earlier author files required');
  const prs = new Set();
  function verify(files, expected) {
    if (!Array.isArray(files) || files.length !== expected.length)
      throw Error('Exact finite C20 path set required');
    const remaining = new Map(expected.map((f) => [f.path, f]));
    for (const file of files) {
      const bound = remaining.get(file.path);
      if (!bound || prior.has(file.path))
        throw Error('Overlapping or unknown C20 source path');
      const bytes = Buffer.from(read(file.path));
      if (
        !/^[a-f0-9]{64}$/.test(file.sha256) ||
        createHash('sha256').update(bytes).digest('hex') !== file.sha256 ||
        file.sha256 !== bound.sha256
      )
        throw Error(`Exact C20 source SHA required: ${file.path}`);
      if (
        !/^[a-f0-9]{40}$/.test(file.blob) ||
        createHash('sha1')
          .update(`blob ${bytes.length}\0`)
          .update(bytes)
          .digest('hex') !== file.blob ||
        file.blob !== bound.blob
      )
        throw Error(`Exact C20 Git blob required: ${file.path}`);
      remaining.delete(file.path);
      prior.add(file.path);
    }
    if (remaining.size) throw Error('Missing C20 source');
  }
  for (const [i, p] of manifest.packages.entries()) {
    const expected = admittedAuthors[i];
    for (const key of [
      'module',
      'component',
      'owner',
      'branch',
      'parent_commit',
      'head_commit',
      'pr_head_commit',
      'draft_pr',
      'focused_new_tests',
      'status',
    ])
      if (p[key] !== expected[key])
        throw Error(`Exact C20 author binding required: ${key}`);
    if (
      !Number.isSafeInteger(p.draft_pr) ||
      p.draft_pr < 1 ||
      prs.has(p.draft_pr)
    )
      throw Error('Exact independent draft PR identity required');
    prs.add(p.draft_pr);
    verify(p.owned_files, expected.owned_files);
  }
  verify([manifest.shared_lint_fix], [sharedLintFix]);
  if (
    !Array.isArray(manifest.shared_followups) ||
    manifest.shared_followups.length !== admittedAuthors.length
  )
    throw Error('Exact five forward-only shared lint followups required');
  for (const [i, followup] of manifest.shared_followups.entries()) {
    const p = admittedAuthors[i];
    if (
      followup.draft_pr !== p.draft_pr ||
      followup.parent_commit !== p.head_commit ||
      followup.head_commit !== p.pr_head_commit ||
      followup.kind !== 'MAIN_SHARED_TEST_LINT_ONLY_NO_ASSERTION_CHANGE' ||
      followup.insertions !== 1 ||
      followup.deletions !== 0 ||
      !Array.isArray(followup.changed_files) ||
      followup.changed_files.length !== 1 ||
      followup.changed_files[0] !== sharedLintFix.path
    )
      throw Error(
        'Exact original parent, current PR head and sole shared lint delta required',
      );
  }
  let independentFiles = 0;
  if (manifest.independent_status === 'PENDING') {
    if (
      manifest.independent_review_commit !== null ||
      !Array.isArray(manifest.independent_files) ||
      manifest.independent_files.length
    )
      throw Error('Pending independent review cannot claim source acceptance');
  } else {
    if (manifest.independent_review_commit !== admittedReview.commit)
      throw Error('Exact independent reviewer commit required');
    verify(manifest.independent_files, admittedReview.files);
    independentFiles = 2;
  }
  return {
    packages: 5,
    author_files: 25,
    independent_files: independentFiles,
    independent_status: manifest.independent_status,
    shared_lint_followups: 5,
    retained_author_files: 423,
    authority: 'LOCAL_SOURCE_EVIDENCE_ONLY',
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  execFileSync(process.execPath, ['scripts/check-cycle19-integrity.mjs'], {
    stdio: 'inherit',
  });
  console.log(
    JSON.stringify(
      validateCycle20Manifest(
        JSON.parse(
          readFileSync('docs/program/CYCLE20_SOURCE_MANIFEST.json', 'utf8'),
        ),
      ),
    ),
  );
  console.log(
    'Cycle20 exact source/blob ownership and earlier423 author files PASS. Protected128/design locks5/bindings13 preserved by retained checker chain. No file restore or release authority.',
  );
}
