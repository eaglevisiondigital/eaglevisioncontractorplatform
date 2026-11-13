import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const proposal = await import(
  new URL('../proposals/invoice-caller-transition/qualify.mjs', import.meta.url)
    .href
);
it('qualifies the exact unapplied amendment through all original 8+13 cases', () => {
  expect(proposal.qualify()).toEqual({
    mode: 'positive',
    status: 'PASS',
    passed: 21,
    failed: 0,
    canonicalSourceChanged: false,
    admissionAuthorized: false,
  });
});
it.each(['unknown-13', 'unknown-source', 'helper-mutation', 'helper-rebind'])(
  'denies actual %s evidence in the disposable amendment',
  (mode) => {
    expect(proposal.qualify({ mode }).status).toBe('DENIED');
  },
);
it.each(['approval', 'rebound-patch'])(
  'rejects %s metadata before executing a proposed source',
  (mode) => {
    const evidence = JSON.parse(
      readFileSync('proposals/invoice-caller-transition/evidence.json', 'utf8'),
    );
    let patch = readFileSync(
      'proposals/invoice-caller-transition/amendment.patch',
    );
    if (mode === 'approval') evidence.admissionAuthorized = true;
    else {
      patch = Buffer.from(
        patch
          .toString()
          .replace('EXACT_HELPER_DIGEST', 'UNREVIEWED_HELPER_DIGEST'),
      );
      evidence.patchSha256 = createHash('sha256').update(patch).digest('hex');
    }
    expect(() => proposal.qualify({ patch, evidence })).toThrow(
      'Exact unapplied transition proposal',
    );
  },
);
it('rejects a valid but unreviewed patch with retained metadata', () => {
  const patch = Buffer.from(
    readFileSync(
      'proposals/invoice-caller-transition/amendment.patch',
      'utf8',
    ).replace('EXACT_HELPER_DIGEST', 'UNREVIEWED_HELPER_DIGEST'),
  );
  expect(() => proposal.qualify({ patch })).toThrow('Exact transition patch');
});
