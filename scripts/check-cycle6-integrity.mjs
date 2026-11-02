import { readFileSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, sep } from 'node:path';
import { validateDesignContract } from './feature-evidence.mjs';
const root = process.cwd();
const read = (path) => {
  if (
    typeof path !== 'string' ||
    path.startsWith('/') ||
    path
      .split('/')
      .some(
        (p) =>
          !p ||
          p === '.' ||
          p === '..' ||
          (p.startsWith('.') && path !== 'supabase/.gitignore'),
      )
  )
    throw Error('Public source path required');
  const parts = path.split('/');
  let current = root;
  for (const part of parts) {
    current = resolve(current, part);
    if (!current.startsWith(root + sep) || lstatSync(current).isSymbolicLink())
      throw Error('Exact public regular source required');
  }
  if (!lstatSync(current).isFile()) throw Error('Regular source file required');
  return readFileSync(current);
};
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const protectedSource = JSON.parse(
  read('docs/program/CYCLE4_PROTECTED_SOURCE.json'),
);
for (const file of protectedSource.files)
  if (hash(read(file.path)) !== file.sha256)
    throw Error(`Protected source changed: ${file.path}`);
const design = validateDesignContract(
  root,
  JSON.parse(read('docs/program/DESIGN_SYSTEM_CONTRACT.json')),
);
const delivery = JSON.parse(read('docs/program/CYCLE6_DELIVERY_INDEX.json'));
const owners = new Set();
let count = 0;
for (const pkg of delivery.packages) {
  if (
    !/^[a-f0-9]{40}$/.test(pkg.head_commit) ||
    !pkg.branch.startsWith('codex/') ||
    !Number.isSafeInteger(pkg.draft_pr)
  )
    throw Error('Exact draft source reference required');
  for (const file of pkg.owned_files) {
    if (owners.has(file.path)) throw Error('Overlapping package ownership');
    owners.add(file.path);
    if (hash(read(file.path)) !== file.sha256)
      throw Error(`Reviewed package source changed: ${file.path}`);
    count++;
  }
}
console.log(
  `Cycle6: ${delivery.packages.length} exact draft packages / ${count} disjoint reviewed files; ${protectedSource.files.length} protected hashes; ${design.lockedFiles} locks / ${design.sourceBindings} bindings PASS. Local evidence only; release NOT AUTHORIZED.`,
);
