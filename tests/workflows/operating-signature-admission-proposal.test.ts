import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const helper = await import(
  new URL(
    '../../proposals/operating-signature-admission/helper.mjs',
    import.meta.url,
  ).href
);
const proposal = await import(
  new URL(
    '../../proposals/operating-signature-admission/qualify.mjs',
    import.meta.url,
  ).href
);
const s = helper.signatureSource;
const bytes = () => helper.signatureGit('show', `${s.author}:${s.path}`);
it('qualifies actual Cycle9 and Cycle24 guards only in a disposable proposal tree', async () => {
  expect(await proposal.qualify()).toEqual({
    cycle9: 'PASS',
    cycle24CriticalSources: 5,
    unknownRuntime: 'DENIED',
    helperMutationsDenied: 4,
    unrelatedRuntime: 'DENIED',
    canonicalCheckersChanged: false,
    admissionAuthorized: false,
  });
});
it('admits only exact committed M1 source against the original historical hash', () => {
  expect(
    helper.admitOperatingSignatureSource(s.path, bytes(), s.originalHash),
  ).toBe(true);
});
it.each(['unknown-current', 'old-current', 'changed-pin', 'unrelated-path'])(
  'preserves %s rejection',
  (mode) => {
    let path = s.path,
      current = bytes(),
      pin = s.originalHash;
    if (mode === 'unknown-current')
      current = Buffer.concat([current, Buffer.from('\n// unknown')]);
    if (mode === 'old-current')
      current = helper.signatureGit('show', `${s.parent}:${s.path}`);
    if (mode === 'changed-pin') pin = '0'.repeat(64);
    if (mode === 'unrelated-path')
      path = 'src/lib/workflows/journey-runtime.ts';
    if (mode === 'unrelated-path')
      expect(helper.admitOperatingSignatureSource(path, current, pin)).toBe(
        false,
      );
    else
      expect(() =>
        helper.admitOperatingSignatureSource(path, current, pin),
      ).toThrow('Exact reviewed');
  },
);
it.each([
  'parent',
  'extra-delta',
  'renamed-delta',
  'mode',
  'missing-author',
  'authored-hash',
  'old-hash',
])('denies %s Git proof', (mode) => {
  const git = (...args: string[]) => {
    if (mode === 'parent' && args.includes('--format=%P'))
      return Buffer.from('0'.repeat(40));
    if (mode === 'extra-delta' && args[0] === 'diff-tree')
      return Buffer.from(`M\t${s.path}\nM\tsrc/other.ts`);
    if (mode === 'renamed-delta' && args[0] === 'diff-tree')
      return Buffer.from(`R100\told\t${s.path}`);
    if (mode === 'mode' && args[0] === 'ls-tree')
      return Buffer.from(`120000 blob ${'0'.repeat(40)}\t${s.path}`);
    if (mode === 'missing-author' && args.includes(`${s.author}:${s.path}`))
      throw Error('Missing published object');
    if (mode === 'authored-hash' && args.includes(`${s.author}:${s.path}`))
      return Buffer.from('unknown');
    if (mode === 'old-hash' && args.includes(`${s.parent}:${s.path}`))
      return Buffer.from('unknown');
    return helper.signatureGit(...args);
  };
  expect(() =>
    helper.admitOperatingSignatureSource(s.path, bytes(), s.originalHash, git),
  ).toThrow();
});
it.each(['approval', 'extra-authority', 'rebound-patch'])(
  'denies %s metadata before source execution',
  async (mode) => {
    const evidence = JSON.parse(
      readFileSync(
        'proposals/operating-signature-admission/evidence.json',
        'utf8',
      ),
    );
    let patch = readFileSync(
      'proposals/operating-signature-admission/checker.patch',
    );
    if (mode === 'approval') evidence.admissionAuthorized = true;
    if (mode === 'extra-authority') evidence.operationalReady = true;
    if (mode === 'rebound-patch') {
      patch = Buffer.from(
        patch
          .toString()
          .replace(
            'Exact reviewed operating-signature',
            'Unreviewed operating-signature',
          ),
      );
      evidence.patchSha256 = createHash('sha256').update(patch).digest('hex');
    }
    await expect(proposal.qualify({ evidence, patch })).rejects.toThrow(
      'Exact unapplied checker proposal',
    );
  },
);
it('rejects unknown patch with original metadata', async () => {
  const patch = Buffer.from(
    readFileSync(
      'proposals/operating-signature-admission/checker.patch',
      'utf8',
    ).replace(
      'Exact reviewed operating-signature',
      'Unreviewed operating-signature',
    ),
  );
  await expect(proposal.qualify({ patch })).rejects.toThrow(
    'Exact checker patch',
  );
});
it('requires the new canonical admission helper to remain absent', () => {
  expect(() => proposal.assertHelperAbsent()).not.toThrow();
  expect(() => proposal.assertHelperAbsent(() => ({}))).toThrow(
    'Canonical admission helper must remain absent',
  );
});
it('only treats ENOENT as absence and rejects inaccessible helper entries', () => {
  expect(() =>
    proposal.assertHelperAbsent(() => {
      throw Object.assign(Error('missing'), { code: 'ENOENT' });
    }),
  ).not.toThrow();
  expect(() =>
    proposal.assertHelperAbsent(() => {
      throw Object.assign(Error('denied'), { code: 'EACCES' });
    }),
  ).toThrow('denied');
});
