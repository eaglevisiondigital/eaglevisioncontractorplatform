export function bindCapturedVisualSource(
  records: readonly { readonly sourceCommit?: string | null }[],
): {
  sourceCommit: string | null;
  sourceState: 'WORKING_TREE_UNCOMMITTED' | 'COMMITTED';
};
