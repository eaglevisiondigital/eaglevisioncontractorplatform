import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';

// Disposable fixture compatibility, NEVER a live source-admission check. The
// canonical F/H/G checkers deliberately continue to reject the unadmitted guard.
export const issuanceAuthorHashes = Object.freeze({
  before: 'da35d098727eff68ae7905c3709d6982cf89560cae538923f5d7e570dab0306e',
  after: 'e1c504f9a7077caa92c375c378fb370155478be9cf077e66bf58932ae0895a3c',
  patch: '45d2eeafaca661d586e707aa6974b3f3216a44988de8a4b3e8d39f55bd3b6f45',
});
const guard =
  " if to_jsonb(h)->>'issued_revision' is not null then raise exception 'Invoice already issued; use issued reader' using errcode='42501';end if;\n";
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const denied = () => Error('Exact held issuance author fixture required');

export function qualifyIssuanceAuthorFixture(source: string, patch: string) {
  if (
    typeof source !== 'string' ||
    typeof patch !== 'string' ||
    hash(patch) !== issuanceAuthorHashes.patch
  )
    throw denied();
  const digest = hash(source);
  if (
    digest !== issuanceAuthorHashes.before &&
    digest !== issuanceAuthorHashes.after
  )
    throw denied();
  // Preserve the complete original #451 fixture assertions. Only an already
  // hash-verified exact author endpoint may project back to its original input;
  // those assertions then reconstruct and execute the SAME exact guarded SQL.
  const original =
    digest === issuanceAuthorHashes.before ? source : source.replace(guard, '');
  if (hash(original) !== issuanceAuthorHashes.before) throw denied();
  return Object.freeze({
    original,
    sourceHash: digest,
    classification:
      digest === issuanceAuthorHashes.before
        ? ('UNAPPLIED_BASELINE' as const)
        : ('EXACT_AUTHOR_FIXTURE_ONLY' as const),
    admission: 'HELD' as const,
  });
}

/** Fixed local fixture paths only. No writer, Git operation, expected-hash input,
 * manifest authority, SQL execution, credentials or operational connection.
 */
export function captureIssuanceAuthorFixture(
  read: (path: string) => Uint8Array = readFileSync,
  stat: (path: string) => ReturnType<typeof lstatSync> = lstatSync,
) {
  const paths = [
    'server/invoices/commercial-drafts.proposed.sql',
    'proposals/commercial-invoice-issuance/draft-projection-guard.patch',
  ];
  const validate = (path: string) => {
    const parts = path.split('/');
    for (let i = 1; i <= parts.length; i++) {
      const info = stat(parts.slice(0, i).join('/'));
      if (
        !info ||
        info.isSymbolicLink() ||
        (i === parts.length &&
          (!info.isFile() || (Number(info.mode) & 0o777) !== 0o644))
      )
        throw denied();
    }
  };
  paths.forEach(validate);
  const source = Buffer.from(read(paths[0])).toString('utf8');
  const patch = Buffer.from(read(paths[1])).toString('utf8');
  paths.forEach(validate);
  return qualifyIssuanceAuthorFixture(source, patch);
}
