/** Runs before test files import exact Git-bound source validators. Local and
 * nonmatching CI contexts perform no network activity. No production entrypoint. */
export default async function setup() {
  const helper: { ensureTestGitHistory: () => unknown } = await import(
    new URL('../../scripts/test-git-history.mjs', import.meta.url).href
  );
  helper.ensureTestGitHistory();
}
