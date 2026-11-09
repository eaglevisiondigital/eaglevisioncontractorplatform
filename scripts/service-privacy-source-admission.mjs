// Test-only successor. No runtime authority or historical pin replacement.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, lstatSync } from 'node:fs';
export const historical = '0825e3c00379a59bea79453a1825a64679cb3847';
export const parent = '6ab439b41dfc9c9a574548e4009ffa684490555f';
export const author = '3c24596c6180af44cb096d03f7ec09f680c68104';
export const typeCorrection = 'de97c31c999d7c8eac1bd0c8be7beceeacab0f51';
export const correctionParent = '67969f331663a8468f162a3790295956b57778c8';
export const collisionTest =
  'tests/workflows/service-privacy-collision.test.ts';
export const testPath = 'tests/cycle9-integration.test.ts';
export const originalHash =
  '2ad4e749f0958b83df3d3b941d54893f17de7e60f58086a29ab2be2ce9bc6310';
export const files = Object.freeze([
  testPath,
  'tests/support/privacy-serialization.ts',
  'tests/workflows/service-privacy-collision.test.ts',
]);
const git = (...args) => execFileSync('git', ['--no-replace-objects', ...args]);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function source(path) {
  let current = '.';
  for (const segment of path.split('/')) {
    current += `/${segment}`;
    if (lstatSync(current).isSymbolicLink())
      throw Error('Source symlink forbidden');
  }
  if (!lstatSync(current).isFile()) throw Error('Regular source required');
  return readFileSync(current);
}
export const privacySourcePorts = {
  git,
  read: source,
};
export function admitServicePrivacyTest(
  path,
  current,
  expected,
  ports = privacySourcePorts,
) {
  if (path !== testPath) return false;
  const fail = () => {
    throw Error('Exact reviewed privacy-test successor required');
  };
  if (expected !== originalHash) fail();
  const old = ports.git('show', `${historical}:${testPath}`);
  if (
    hash(old) !== expected ||
    ports.git('rev-parse', `${author}^`).toString().trim() !== parent
  )
    fail();
  const delta = ports
    .git('diff-tree', '--no-commit-id', '--name-only', '-r', author)
    .toString()
    .trim()
    .split('\n')
    .sort();
  if (JSON.stringify(delta) !== JSON.stringify([...files].sort())) fail();
  const transformed =
    `import { privacySerialization } from './support/privacy-serialization';\n` +
    old
      .toString()
      .replace(
        'expect(JSON.stringify(r.service)).not.toMatch(',
        'expect(privacySerialization(r.service)).not.toMatch(',
      );
  if (!Buffer.from(current).equals(Buffer.from(transformed))) fail();
  if (
    ports.git('rev-parse', `${typeCorrection}^`).toString().trim() !==
      correctionParent ||
    ports
      .git('diff-tree', '--no-commit-id', '--name-only', '-r', typeCorrection)
      .toString()
      .trim() !== collisionTest
  )
    fail();
  const originalCollision = ports
    .git('show', `${author}:${collisionTest}`)
    .toString();
  const correctedCollision = originalCollision.replace(
    '    return `555010${id.slice(6)}`;',
    "    const [prefix, part2, part3, part4, part5] = id.split('-');\n    return `555010${prefix.slice(6)}-${part2}-${part3}-${part4}-${part5}`;",
  );
  if (
    correctedCollision === originalCollision ||
    ports.git('show', `${typeCorrection}:${collisionTest}`).toString() !==
      correctedCollision
  )
    fail();
  for (const file of files) {
    if (
      ports
        .git(
          'ls-tree',
          file === collisionTest ? typeCorrection : author,
          '--',
          file,
        )
        .toString()
        .split(' ')[0] !== '100644'
    )
      fail();
    if (
      !Buffer.from(ports.read(file)).equals(
        ports.git(
          'show',
          `${file === collisionTest ? typeCorrection : author}:${file}`,
        ),
      )
    )
      fail();
  }
  return true;
}
