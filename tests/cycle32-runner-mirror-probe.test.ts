import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const { classifyMirrorText, observeMirrorValidation, redactSourceShape } =
  await import(
    new URL('../scripts/cycle32-runner-mirror-probe.mjs', import.meta.url).href
  );
const { validateUbuntuMirrors } = await import(
  new URL('../scripts/cycle30-chromium-dependencies.mjs', import.meta.url).href
);
const digest = (text: string) =>
  createHash('sha256').update(text).digest('hex');
const mirrors =
  'http://azure.archive.ubuntu.com/ubuntu/\tpriority:1\nhttps://archive.ubuntu.com/ubuntu/\tpriority:2\nhttps://security.ubuntu.com/ubuntu/\tpriority:3\n';

it('classifies only six exact public official targets without admitting them', () => {
  const targets = ['azure.archive', 'archive', 'security'].flatMap((host) =>
    ['http', 'https'].map((scheme) => `${scheme}://${host}.ubuntu.com/ubuntu/`),
  );
  const view = classifyMirrorText(
    targets.map((uri) => `${uri} priority:1`).join('\n'),
  );
  expect(view.rows.map((row: { target: string }) => row.target)).toEqual([
    'azure-http',
    'azure-https',
    'archive-http',
    'archive-https',
    'security-http',
    'security-https',
  ]);
  expect(view.status).toBe('OBSERVED_NOT_ACCEPTANCE');
});

it('redacts a credential-bearing URL and unknown target metadata', () => {
  const uri = 'https://person:private-value@archive.ubuntu.com/ubuntu/';
  const view = classifyMirrorText(`${uri} priority:1`);
  expect(view.rows[0].target).toBe('UNRECOGNIZED');
  expect(view.rows[0].target_sha256).toBe(digest(uri));
  expect(JSON.stringify(view)).not.toMatch(/person|private-value|https:/);
  const sourceView = redactSourceShape({
    source_sha256: digest('fixture'),
    validation: 'PASS',
    stanzas: [
      {
        index: 0,
        comment_only: false,
        fields: [
          {
            name: 'Private-Field-Name',
            value: 'private-value',
            value_sha256: digest('private-value'),
          },
          { name: 'Types', value: 'deb', value_sha256: digest('deb') },
        ],
      },
    ],
  });
  expect(sourceView.stanzas[0].fields[0].name).toBe('UNRECOGNIZED');
  expect(sourceView.stanzas[0].fields[0].name_sha256).toBe(
    digest('Private-Field-Name'),
  );
  expect(sourceView.stanzas[0].fields[1].value).toBe('deb');
  expect(JSON.stringify(sourceView)).not.toMatch(/Private-Field|private-value/);
});

it.each([0, 10])(
  'observes numeric priority %i while the original helper still rejects it',
  (priority) => {
    const changed = mirrors.replace('priority:1', `priority:${priority}`);
    expect(classifyMirrorText(changed).rows[0].priority).toBe(priority);
    expect(() => validateUbuntuMirrors(changed)).toThrow(
      'Reviewed Ubuntu mirror and priority required',
    );
    expect(observeMirrorValidation(changed)).toBe(
      'REJECT_REVIEWED_MIRROR_OR_PRIORITY',
    );
  },
);

it('hashes malformed or missing priority tokens instead of serializing them', () => {
  for (const token of [
    'priority:-1',
    'priority:1000',
    'priority:secret',
    'priority:NaN',
    '',
  ]) {
    const view = classifyMirrorText(
      `https://archive.ubuntu.com/ubuntu/ ${token}`,
    );
    expect(view.rows[0].priority).toBeNull();
    expect(view.rows[0].priority_token_sha256).toBe(
      token ? digest(token) : null,
    );
    expect(JSON.stringify(view)).not.toContain(token || 'priority:');
  }
});

it('counts and hashes all extra tokens without exposing options or secrets', () => {
  const view = classifyMirrorText(
    'https://archive.ubuntu.com/ubuntu/ priority:2 trusted=yes secret=sample',
  );
  expect(view.rows[0].token_count).toBe(4);
  expect(view.rows[0].extra_token_count).toBe(2);
  expect(view.rows[0].extra_token_sha256).toEqual([
    digest('trusted=yes'),
    digest('secret=sample'),
  ]);
  expect(JSON.stringify(view)).not.toMatch(/trusted|sample|secret=/);
});

it('ignores comment-only and empty rows without emitting comment contents', () => {
  const view = classifyMirrorText(`# private-looking comment\n\n${mirrors}`);
  expect(view.rows).toHaveLength(3);
  expect(view.rows[0].index).toBe(2);
  expect(JSON.stringify(view)).not.toContain('private-looking');
});

it('bounds bytes, meaningful rows and tokens with hash-only failure evidence', () => {
  for (const text of [
    'x'.repeat(65537),
    Array.from({ length: 65 }, () => 'secret').join('\n'),
    Array.from({ length: 17 }, () => 'secret').join(' '),
  ]) {
    const view = classifyMirrorText(text);
    expect(view).toEqual({
      status: 'BOUNDS_EXCEEDED',
      sha256: digest(text),
      rows: [],
    });
  }
});

it('retains the exact reviewed helper acceptance and unknown-URI denial', () => {
  expect(observeMirrorValidation(mirrors)).toBe('PASS_EXISTING_VALIDATOR');
  const changed = mirrors.replace(
    'http://azure.archive.ubuntu.com/ubuntu/',
    'https://unreviewed.example/ubuntu/',
  );
  expect(() => validateUbuntuMirrors(changed)).toThrow();
  expect(observeMirrorValidation(changed)).toBe(
    'REJECT_REVIEWED_MIRROR_OR_PRIORITY',
  );
});

it('keeps the original Passport workflow byte-exact except observation and report', () => {
  const workflow = readFileSync(
    new URL('../.github/workflows/passport-timeline.yml', import.meta.url),
    'utf8',
  );
  const observation =
    "      - name: Observe this runner's source and mirror shape without changing trust\n" +
    '        run: |\n' +
    '          set -euo pipefail\n' +
    '          mkdir -p artifacts/cycle32\n' +
    '          node scripts/cycle32-runner-mirror-probe.mjs > artifacts/cycle32/passport-runner-mirror.json\n';
  const report = '            artifacts/cycle32/passport-runner-mirror.json\n';
  expect(workflow.split(observation)).toHaveLength(2);
  expect(workflow.split(report)).toHaveLength(2);
  expect(digest(workflow.replace(observation, '').replace(report, ''))).toBe(
    '4ec0e1d4f47201e53ea5a527d84ab7e7191451f6844ae74a0645bb7037e13104',
  );
  for (const [file, expected] of [
    [
      'cycle30-chromium-dependencies.mjs',
      '531b1f3b43e38975a456a8421fc7135991b89313e22e0f87daa5ecc673bf659f',
    ],
    [
      'cycle31-ubuntu-source-probe.mjs',
      'faee337a766c98ba22439992956f523e7b4c314ab2eb75a1e830e4c1e7320402',
    ],
  ])
    expect(
      digest(
        readFileSync(new URL(`../scripts/${file}`, import.meta.url), 'utf8'),
      ),
    ).toBe(expected);
  const diagnosticWorkflow = readFileSync(
    new URL(
      '../.github/workflows/cycle32-runner-mirror-diagnosis.yml',
      import.meta.url,
    ),
    'utf8',
  );
  expect(diagnosticWorkflow).toContain('sample: [1, 2, 3]');
  expect(diagnosticWorkflow).toContain('timeout-minutes: 5');
  expect(diagnosticWorkflow).toContain("node-version: '24.22.2'");
  expect(diagnosticWorkflow).toContain('if: always()');
  expect(diagnosticWorkflow).not.toMatch(
    /npm ci|apt-get|playwright|pull_request:/,
  );
});
