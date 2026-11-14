import { readFileSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { readCommercialCapacityProposal } from '../proposals/commercial-payment-capacity/qualification';

const source = JSON.parse(
  readFileSync('proposals/commercial-payment-capacity/source.json', 'utf8'),
) as { files: { path: string; sha256: string }[] };
it('captures exact approved source and forward guard without an installer, runtime grant or execution approval', () => {
  const p = readCommercialCapacityProposal();
  expect(p.classification).toBe('UNAPPLIED_DISPOSABLE_POSTGRESQL_ONLY');
  expect(p.installationAuthorized).toBe(false);
  expect(p.financialExecutionAuthorized).toBe(false);
  expect(p.invoiceSource).toBe('7e25b50537fe66c19f5041e64bd2e59effc544c4');
  expect(p.migrations).toHaveLength(14);
  expect(Object.isFrozen(p) && Object.isFrozen(p.migrations)).toBe(true);
  expect(createHash('sha256').update(p.draftSql).digest('hex')).toBe(
    'e1c504f9a7077caa92c375c378fb370155478be9cf077e66bf58932ae0895a3c',
  );
});
it.each(source.files)(
  'rejects unknown $path bytes despite any proposed manifest change',
  ({ path: target }) => {
    const read = ((p: Parameters<typeof readFileSync>[0]) => {
      const bytes = readFileSync(p);
      return String(p) === target
        ? Buffer.concat([bytes, Buffer.from('\nUNREVIEWED')])
        : bytes;
    }) as typeof readFileSync;
    expect(() => readCommercialCapacityProposal({ read })).toThrow();
  },
);
it.each(['symlink', 'directory', 'writable-mode'] as const)(
  'denies %s proposal entries before source execution',
  (kind) => {
    const stat = ((path: Parameters<typeof lstatSync>[0]) => {
      const info = lstatSync(path);
      if (
        String(path) !==
        'proposals/commercial-payment-capacity/capacity.proposed.sql'
      )
        return info;
      return new Proxy(info, {
        get(object, key) {
          if (key === 'isSymbolicLink' && kind === 'symlink') return () => true;
          if (key === 'isFile' && kind === 'directory') return () => false;
          if (key === 'mode' && kind === 'writable-mode') return 0o666;
          return Reflect.get(object, key);
        },
      });
    }) as typeof lstatSync;
    expect(() => readCommercialCapacityProposal({ stat })).toThrow();
  },
);
it('denies withdrawal of earlier invoice source from a later final source read', () => {
  let withdrawn = false;
  const read = ((path: Parameters<typeof readFileSync>[0]) => {
    if (String(path) === 'tests/database/bootstrap.sql') withdrawn = true;
    const bytes = readFileSync(path);
    return withdrawn &&
      String(path) ===
        'proposals/commercial-payment-capacity/reviewed-drafts.sql'
      ? Buffer.concat([bytes, Buffer.from('\nWITHDRAWN')])
      : bytes;
  }) as typeof readFileSync;
  expect(() => readCommercialCapacityProposal({ read })).toThrow();
  expect(withdrawn).toBe(true);
});
