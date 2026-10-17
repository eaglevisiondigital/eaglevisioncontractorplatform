import { assertIsolatedBuild } from '../server/staging/build-policy.ts';
assertIsolatedBuild(process.env);
console.log(
  'Internal staging build context accepted. Outside access and execution remain separately prohibited.',
);
