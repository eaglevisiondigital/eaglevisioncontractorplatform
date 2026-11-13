// Read-only proposal qualification; temp copies only. No source admission or cloud access.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  readFileSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  lstatSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  admitC17InventorySuccessor,
  inventoryPath,
  inventoryParent,
} from '../../scripts/v1-c17-inventory-source.mjs';
const directory = 'proposals/c17-field-closeout';
const manifest = JSON.parse(readFileSync(`${directory}/finite-successor.json`));
// This is the reviewed preparation tuple, NOT authority to create/admit an author.
// Self-consistent replacement hashes or claimed approvals in local JSON are insufficient.
const reviewedManifest = JSON.parse(
  execFileSync('git', [
    '--no-replace-objects',
    'show',
    `4b9e1a72d7937e5badcf5aa0ac640ae0403bb35c:${directory}/finite-successor.json`,
  ]),
);
function assertReviewedManifest(candidate) {
  assert.deepEqual(
    candidate,
    reviewedManifest,
    'Exact reviewed finite preparation manifest required',
  );
}
// Validate before following any manifest-selected path or evaluating its hash claims.
assertReviewedManifest(manifest);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const current = readFileSync(inventoryPath);
const previous = execFileSync('git', [
  'show',
  `${inventoryParent}:${inventoryPath}`,
]);
function proposedCopy() {
  const patch = readFileSync(manifest.patch.path);
  assert.equal(hash(patch), manifest.patch.sha256);
  const temporary = mkdtempSync(join(tmpdir(), 'propel-c17-successor-copy-'));
  try {
    mkdirSync(join(temporary, 'tests'));
    writeFileSync(join(temporary, inventoryPath), current);
    execFileSync('git', ['apply', resolve(manifest.patch.path)], {
      cwd: temporary,
    });
    return readFileSync(join(temporary, inventoryPath));
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
test('exact future M1/A1 scope is bound but author and admission remain unavailable', () => {
  assert.equal(
    manifest.preparationParent,
    '61f903eba93735ae945b0a16fcc07c0af9b7bbb0',
  );
  assert.equal(manifest.futureAuthor.soleParent, manifest.preparationParent);
  assert.equal(manifest.futureAuthor.commit, null);
  assert.equal(manifest.admissionReady, false);
  assert.deepEqual(
    manifest.futureAuthor.exactDelta.map(({ status, path }) => ({
      status,
      path,
    })),
    [
      { status: 'M', path: inventoryPath },
      { status: 'A', path: 'docs/program/V1_C17_FIELD_CLOSEOUT_SOURCE.md' },
    ],
  );
  for (const file of [
    ...manifest.unchangedProtectedConsumers,
    ...manifest.unchangedReferencedInputs,
  ]) {
    assert(lstatSync(file.path).isFile());
    assert(!lstatSync(file.path).isSymbolicLink());
    assert.equal(hash(readFileSync(file.path)), file.sha256);
  }
  const [modified, added] = manifest.futureAuthor.exactDelta;
  assert.equal(hash(current), modified.beforeSha256);
  assert.equal(hash(readFileSync(added.sourceArtifact)), added.sha256);
  assert.equal(hash(proposedCopy()), modified.afterSha256);
  assert.equal(hash(readFileSync(inventoryPath)), modified.beforeSha256);
});
test('unchanged existing admission denies proposed or unknown test bytes without any checker edits', () => {
  const proposed = proposedCopy();
  for (const bytes of [
    proposed,
    Buffer.concat([proposed, Buffer.from('\n// unknown edit\n')]),
  ]) {
    assert.throws(
      () =>
        admitC17InventorySuccessor(inventoryPath, bytes, previous, {
          read: (path) => (path === inventoryPath ? bytes : readFileSync(path)),
        }),
      /Complete exact current C17 test\/doc bundle required/,
    );
  }
  assert.equal(hash(readFileSync(inventoryPath)), hash(current));
});
test('log-only classification preserves all fifteen unresolved markers and does not infer timeout causes', () => {
  const evidence = JSON.parse(
    readFileSync(`${directory}/remaining-ci-markers.json`),
  );
  assert.equal(evidence.runId, 43329736524);
  assert.equal(
    evidence.logSha256,
    'b76252cb7b10c9fe4b32a81f88ab4213500384b6d78cab6c94530e898d29a41d',
  );
  assert.equal(evidence.markers.length, 15);
  assert.equal(
    evidence.markers.filter((m) => m.durationMs >= 30000).length,
    12,
  );
  assert.equal(evidence.markers.filter((m) => m.durationMs < 10).length, 3);
  assert(
    evidence.markers.every(
      (m) =>
        m.rootCause === 'NOT_DIAGNOSED_NO_FINAL_ASSERTION_OR_STACK_EMITTED',
    ),
  );
});

const mutations = [
  [
    'executable modified-file mode',
    (m) => {
      m.futureAuthor.exactDelta[0].mode = '100755';
    },
  ],
  [
    'symlink added-file mode',
    (m) => {
      m.futureAuthor.exactDelta[1].mode = '120000';
    },
  ],
  [
    'changed sole parent',
    (m) => {
      m.futureAuthor.soleParent = '0'.repeat(40);
    },
  ],
  [
    'unreviewed future author',
    (m) => {
      m.futureAuthor.commit = '0'.repeat(40);
    },
  ],
  [
    'claimed author approval',
    (m) => {
      m.futureAuthor.status = 'APPROVED';
    },
  ],
  [
    'claimed admission readiness',
    (m) => {
      m.admissionReady = true;
    },
  ],
  [
    'claimed checker admission',
    (m) => {
      m.futureAdmission.status = 'ADMITTED';
    },
  ],
  [
    'removed approval exclusions',
    (m) => {
      m.futureAdmission.notAuthorizedNow = [];
    },
  ],
  [
    'recomputed proposed-test binding',
    (m) => {
      m.futureAuthor.exactDelta[0].afterSha256 = '0'.repeat(64);
    },
  ],
  [
    'recomputed companion binding',
    (m) => {
      m.futureAuthor.exactDelta[1].sha256 = '0'.repeat(64);
    },
  ],
  [
    'redirected companion path',
    (m) => {
      m.futureAuthor.exactDelta[1].sourceArtifact = 'unreviewed.invalid';
    },
  ],
  [
    'recomputed patch binding',
    (m) => {
      m.patch.sha256 = '0'.repeat(64);
    },
  ],
  [
    'replaced source-protection binding',
    (m) => {
      m.unchangedProtectedConsumers[0].sha256 = '0'.repeat(64);
    },
  ],
  [
    'extra alleged authority',
    (m) => {
      m.executionApproved = true;
    },
  ],
];
for (const [name, mutate] of mutations) {
  test(`reviewed package denies ${name} before artifact or authority use`, () => {
    const changed = structuredClone(manifest);
    mutate(changed);
    assert.throws(
      () => assertReviewedManifest(changed),
      /Exact reviewed finite preparation manifest required/,
    );
  });
}
