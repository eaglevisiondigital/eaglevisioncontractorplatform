import { afterEach, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateDesignContract } from '../scripts/feature-evidence.mjs';

const roots: string[] = [];
afterEach(() =>
  roots
    .splice(0)
    .forEach((root) => rmSync(root, { recursive: true, force: true })),
);
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'propel-design-'));
  roots.push(root);
  mkdirSync(join(root, 'src'));
  const source = ':root { --platform-emerald: #00543e; }';
  writeFileSync(join(root, 'src/styles.css'), source);
  return {
    root,
    contract: {
      schema: 'propel-design-contract-v1',
      baselineCommit: 'a'.repeat(40),
      approval: 'locked_existing_designs',
      locks: [
        {
          path: 'src/styles.css',
          sha256: createHash('sha256').update(source).digest('hex'),
        },
      ],
      bindings: [
        {
          id: 'platform-emerald',
          source: {
            path: 'src/styles.css',
            anchor: '--platform-emerald: #00543e;',
          },
        },
      ],
    },
  };
}
it('binds exact existing design bytes and source tokens without claiming runtime acceptance', () => {
  const { root, contract } = fixture();
  const before = structuredClone(contract);
  expect(validateDesignContract(root, contract)).toEqual({
    lockedFiles: 1,
    sourceBindings: 1,
    runtimeAcceptance: 'NOT_INFERRED',
  });
  expect(contract).toEqual(before);
});
it('blocks unreviewed shared CSS or artwork changes even when a token remains', () => {
  const { root, contract } = fixture();
  writeFileSync(
    join(root, 'src/styles.css'),
    ':root { --platform-emerald: #00543e; } .other { color: red; }',
  );
  expect(() => validateDesignContract(root, contract)).toThrow(
    'design source changed',
  );
});
it('rejects missing component bindings and duplicated lock or token identities', () => {
  const a = fixture();
  a.contract.bindings[0].source.anchor = 'absent-component';
  expect(() => validateDesignContract(a.root, a.contract)).toThrow('anchor');
  const b = fixture();
  b.contract.locks.push(b.contract.locks[0]);
  expect(() => validateDesignContract(b.root, b.contract)).toThrow(
    'design lock',
  );
  const c = fixture();
  c.contract.bindings.push(c.contract.bindings[0]);
  expect(() => validateDesignContract(c.root, c.contract)).toThrow(
    'design binding',
  );
});
it('does not admit private paths or linked design files into public evidence', () => {
  const a = fixture();
  a.contract.locks[0].path = '.staging/private.png';
  expect(() => validateDesignContract(a.root, a.contract)).toThrow(
    'Public repository',
  );
  const b = fixture();
  symlinkSync(join(b.root, 'src/styles.css'), join(b.root, 'src/linked.css'));
  b.contract.locks[0].path = 'src/linked.css';
  expect(() => validateDesignContract(b.root, b.contract)).toThrow('links');
});
it('requires an exact approved contract and hash rather than a design approval flag', () => {
  const a = fixture();
  a.contract.approval = 'new_redesign';
  expect(() => validateDesignContract(a.root, a.contract)).toThrow(
    'Locked design',
  );
  const b = fixture();
  b.contract.locks[0].sha256 = 'latest';
  expect(() => validateDesignContract(b.root, b.contract)).toThrow(
    'design lock',
  );
});
