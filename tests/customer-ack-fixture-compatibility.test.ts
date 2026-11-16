import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import ts from 'typescript';
const cwd = process.cwd();
const folder = 'proposals/customer-ack-fixture-compatibility/';
const fixturePath = 'tests/customer-payment-ack-composition-source.test.ts';
const payload = readFileSync(
  join(cwd, folder + 'source-tests.proposed.txt'),
  'utf8',
);
const before = readFileSync(join(cwd, fixturePath), 'utf8');
const originalTail = before.slice(
  before.indexOf("it('qualifies only declared"),
);
const begin = payload.indexOf('// BEGIN CURRENT_SOURCE_FIXTURE_ONLY');
const end = payload.indexOf('// END CURRENT_SOURCE_FIXTURE_ONLY');
const imports = payload.slice(0, begin).split('\n').slice(1).join('\n');
const helper =
  imports +
  payload.slice(begin, end) +
  '\nexport { prepareCurrentAckFixture };';
const compiled = ts.transpileModule(helper, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const moduleUrl =
  'data:text/javascript;base64,' + Buffer.from(compiled).toString('base64');
let scratch: string, baseline: string;
let sequence = 0;
beforeAll(() => {
  scratch = mkdtempSync(join(realpathSync(tmpdir()), 'ack-fixture-controls-'));
  baseline = join(scratch, 'baseline');
  cpSync(cwd, baseline, {
    recursive: true,
    filter: (p) =>
      ![
        '.git',
        'node_modules',
        folder.slice(0, -1),
        'tests/customer-ack-fixture-compatibility.test.ts',
      ].some(
        (name) => p === join(cwd, name) || p.startsWith(join(cwd, name) + '/'),
      ),
  });
  writeFileSync(join(baseline, fixturePath), payload);
});
afterAll(() => {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
});
function control(body: string) {
  const root = join(scratch, 'case-' + sequence++);
  cpSync(baseline, root, { recursive: true });
  const code = `import fs from 'node:fs';import assert from 'node:assert/strict';import {join} from 'node:path';import {pathToFileURL} from 'node:url';import {syncBuiltinESMExports} from 'node:module';
const root=${JSON.stringify(root)}, fixturePath=${JSON.stringify(fixturePath)};
const {prepareCurrentAckFixture:prepare}=await import(${JSON.stringify(moduleUrl)});
const qualifierUrl=pathToFileURL(join(root,'proposals/customer-payment-ack-composition/qualify.mjs')).href;
const old='proposals/customer-payment-ack-composition/', extra='proposals/customer-payment-ack-native-negatives/';
let f;const extraCleanup=[];async function denied(operation){let caught;try{await operation();}catch(error){caught=error;}assert.ok(caught,'Operation must deny');}
try {${body}\nconsole.log('CONTROL_PASS');}finally{if(f)fs.rmSync(f.root,{recursive:true,force:true});for(const p of extraCleanup)fs.rmSync(p,{recursive:true,force:true});}`;
  try {
    return execFileSync(process.execPath, ['--input-type=module', '-e', code], {
      cwd,
      encoding: 'utf8',
      timeout: 15000,
      stdio: 'pipe',
    }).trim();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
it('preserves every original twelve-case body and all literal source expectations', () => {
  expect(createHash('sha256').update(before).digest('hex')).toBe(
    '8d1c7769257ce09ee70dacde0c47748f2fcd1245f863d57351ed5229665c1dfd',
  );
  expect(payload.endsWith(originalTail)).toBe(true);
  expect(createHash('sha256').update(originalTail).digest('hex')).toBe(
    'ad79624cdf16a4bf5ede4bc08660ddc243340b05a74a58b12758742b0b309524',
  );
});
it('qualifies current known source only while raw507 still denies and operating authority stays held', () => {
  expect(
    control(
      String.raw`const original=await import(qualifierUrl);await denied(()=>original.capture(root));f=await prepare(root,qualifierUrl);assert.equal(f.initial.base.length,2477);assert.equal(f.initial.operationalReady,false);assert.equal(f.initial.m.installationAuthorized,false);const image=f.materialize().directory;extraCleanup.push(image);assert.equal(f.verifyMaterialized(image).files,2482);`,
    ),
  ).toBe('CONTROL_PASS');
});
it('ignores unrelated noisy host artifacts without copying or admitting them', () => {
  expect(
    control(
      String.raw`fs.mkdirSync(join(root,'artifacts/cycle27/concurrent'),{recursive:true});fs.writeFileSync(join(root,'artifacts/cycle27/concurrent/probe.json'),'FICTIONAL HOST OUTPUT');f=await prepare(root,qualifierUrl);assert.equal(fs.existsSync(join(f.root,'artifacts/cycle27/concurrent/probe.json')),false);fs.writeFileSync(join(root,'artifacts/cycle27/concurrent/later.json'),'MORE HOST OUTPUT');f.capture();`,
    ),
  ).toBe('CONTROL_PASS');
});
it('copies current unsealed fixture documentation instead of historical Git bodies', () => {
  expect(
    control(
      String.raw`const path=join(root,old+'README.md');fs.appendFileSync(path,'\nCURRENT_FIXTURE_DOCUMENTATION\n');f=await prepare(root,qualifierUrl);assert.equal(fs.readFileSync(join(f.root,old+'README.md'),'utf8'),fs.readFileSync(path,'utf8'));assert.ok(fs.readFileSync(join(f.root,old+'README.md'),'utf8').includes('CURRENT_FIXTURE_DOCUMENTATION'));`,
    ),
  ).toBe('CONTROL_PASS');
});
it.each([
  ['missing', String.raw`fs.unlinkSync(join(root,extra+'README.md'));`],
  [
    'substituted',
    String.raw`fs.writeFileSync(join(root,extra+'native-negative-tail.proposed.txt'),'// UNKNOWN');`,
  ],
  ['mode', String.raw`fs.chmodSync(join(root,extra+'README.md'),0o755);`],
  [
    'symlink',
    String.raw`const p=join(root,extra+'README.md');fs.renameSync(p,p+'.target');fs.symlinkSync(p+'.target',p);`,
  ],
  [
    'directory symlink',
    String.raw`const p=join(root,extra.slice(0,-1));fs.renameSync(p,p+'.target');fs.symlinkSync(p+'.target',p);`,
  ],
  [
    'unknown companion',
    String.raw`fs.writeFileSync(join(root,extra+'fourth.txt'),'UNKNOWN');`,
  ],
])('rejects %s outside-authority fixture data', (_name, mutate) => {
  expect(
    control(String.raw`${mutate}await denied(()=>prepare(root,qualifierUrl));`),
  ).toBe('CONTROL_PASS');
});
it('rejects coordinated fixture-tail and metadata rebinding', () => {
  expect(
    control(
      String.raw`fs.writeFileSync(join(root,extra+'native-negative-tail.proposed.txt'),'// REBOUND');const p=join(root,extra+'source.json'),m=JSON.parse(fs.readFileSync(p));m.fixtureTailSha256='0'.repeat(64);fs.writeFileSync(p,JSON.stringify(m));await denied(()=>prepare(root,qualifierUrl));`,
    ),
  ).toBe('CONTROL_PASS');
});
it.each([
  [
    'missing current runtime',
    String.raw`fs.unlinkSync(join(root,'proposals/customer-payment-link-lifecycle/read.ts'));`,
  ],
  [
    'changed current runtime',
    String.raw`fs.appendFileSync(join(root,'proposals/customer-payment-link-lifecycle/read.ts'),'\n// WITHDRAWN');`,
  ],
  [
    'runtime mode',
    String.raw`fs.chmodSync(join(root,'proposals/customer-payment-link-lifecycle/read.ts'),0o755);`,
  ],
  [
    'runtime symlink',
    String.raw`const p=join(root,'proposals/customer-payment-link-lifecycle/read.ts');fs.renameSync(p,p+'.target');fs.symlinkSync(p+'.target',p);`,
  ],
  [
    'historical assertion',
    String.raw`const p=join(root,fixturePath);fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace('toHaveLength(2477)','toHaveLength(1)'));`,
  ],
])(
  'rejects %s instead of filling from available old objects',
  (_name, mutate) => {
    expect(
      control(
        String.raw`${mutate}await denied(()=>prepare(root,qualifierUrl));`,
      ),
    ).toBe('CONTROL_PASS');
  },
);
it('denies an altered qualifier before its unknown module body can execute', () => {
  expect(
    control(
      String.raw`const marker=join(root,'UNKNOWN_MODULE_EXECUTED');fs.appendFileSync(join(root,old+'qualify.mjs'),'\nwriteFileSync('+JSON.stringify(marker)+',"EXECUTED");');await denied(()=>prepare(root,qualifierUrl));assert.equal(fs.existsSync(marker),false);`,
    ),
  ).toBe('CONTROL_PASS');
});
it.each([
  [
    'current source',
    String.raw`fs.appendFileSync(join(root,old+'readback.proposed.txt'),'// WITHDRAWN');`,
  ],
  [
    'outside-authority data',
    String.raw`fs.appendFileSync(join(root,extra+'README.md'),'WITHDRAWN');`,
  ],
  [
    'clean source',
    String.raw`fs.appendFileSync(join(f.root,old+'readback.proposed.txt'),'// WITHDRAWN');`,
  ],
  [
    'unknown clean file',
    String.raw`fs.writeFileSync(join(f.root,'src/unknown-ack.ts'),'UNKNOWN');`,
  ],
  [
    'unknown empty clean directory',
    String.raw`fs.mkdirSync(join(f.root,'src/unknown-empty'));`,
  ],
  [
    'source root identity',
    String.raw`const p=root+'.original';fs.renameSync(root,p);extraCleanup.push(p);fs.cpSync(p,root,{recursive:true});`,
  ],
  [
    'clean root identity',
    String.raw`const p=f.root+'.original';fs.renameSync(f.root,p);extraCleanup.push(p);fs.cpSync(p,f.root,{recursive:true});`,
  ],
])(
  'rejects late %s withdrawal before returning a fixture result',
  (_name, mutate) => {
    expect(
      control(
        String.raw`f=await prepare(root,qualifierUrl);${mutate}await denied(()=>f.capture());`,
      ),
    ).toBe('CONTROL_PASS');
  },
);
it('post-operation source withdrawal cannot return a previously qualified fixture result', () => {
  expect(
    control(
      String.raw`f=await prepare(root,qualifierUrl);const path=join(root,old+'readback.proposed.txt'),raw=fs.readFileSync;let hits=0;fs.readFileSync=(...args)=>{const bytes=raw(...args);if(String(args[0])===path&&++hits===3)fs.writeFileSync(path,'// WITHDRAWN AFTER CAPTURE');return bytes;};syncBuiltinESMExports();try{await denied(()=>f.capture());assert.ok(hits>=3);assert.equal(raw(path,'utf8'),'// WITHDRAWN AFTER CAPTURE');}finally{fs.readFileSync=raw;syncBuiltinESMExports();}`,
    ),
  ).toBe('CONTROL_PASS');
});
