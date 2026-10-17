export function assertIsolatedBuild(env: Record<string, string | undefined>) {
  if (env.CONTEXT === 'production')
    throw new Error(
      'Production Release 1.0 is not approved. Production builds are disabled.',
    );
  if (
    !['deploy-preview', 'branch-deploy'].includes(env.CONTEXT ?? '') ||
    env.EV_ISOLATED_STAGING_BUILD !== 'approved-internal-only' ||
    !/^(codex\/|staging$)/.test(env.BRANCH ?? '')
  )
    throw new Error(
      'Build requires explicitly configured isolated internal staging context.',
    );
}
