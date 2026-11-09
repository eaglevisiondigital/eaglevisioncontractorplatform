import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  admitServicePrivacyTest,
  privacySourcePorts,
  testPath,
  originalHash,
  author,
} from '../scripts/service-privacy-source-admission.mjs';
const current = privacySourcePorts.read(testPath);
test('admits only the exact reviewed test successor and all three authored files', () => {
  assert.equal(admitServicePrivacyTest(testPath, current, originalHash), true);
});
test('rejects unknown paths without admitting source', () => {
  assert.equal(
    admitServicePrivacyTest(
      'src/lib/workflows/portfolio-service.ts',
      current,
      originalHash,
    ),
    false,
  );
});
test('rejects replacement historical pins', () => {
  assert.throws(() =>
    admitServicePrivacyTest(testPath, current, '0'.repeat(64)),
  );
});
test('rejects altered original assertions', () => {
  assert.throws(() =>
    admitServicePrivacyTest(
      testPath,
      Buffer.from(current.toString().replace('|555010/', '/')),
      originalHash,
    ),
  );
});
test('rejects helper drift after author review', () => {
  assert.throws(() =>
    admitServicePrivacyTest(testPath, current, originalHash, {
      ...privacySourcePorts,
      read: (path) =>
        path.includes('/support/')
          ? Buffer.from('unknown helper')
          : privacySourcePorts.read(path),
    }),
  );
});
test('rejects an extra authored file', () => {
  assert.throws(() =>
    admitServicePrivacyTest(testPath, current, originalHash, {
      ...privacySourcePorts,
      git: (...args) =>
        args[0] === 'diff-tree'
          ? Buffer.from(
              privacySourcePorts.git(...args).toString() + 'extra.ts\n',
            )
          : privacySourcePorts.git(...args),
    }),
  );
});
test('rejects incorrect author ancestry', () => {
  assert.throws(() =>
    admitServicePrivacyTest(testPath, current, originalHash, {
      ...privacySourcePorts,
      git: (...args) =>
        args[0] === 'rev-parse' && args[1] === `${author}^`
          ? Buffer.from('0'.repeat(40))
          : privacySourcePorts.git(...args),
    }),
  );
});
