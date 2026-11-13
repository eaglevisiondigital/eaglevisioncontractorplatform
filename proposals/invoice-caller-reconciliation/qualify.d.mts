export const expected: Readonly<Record<string, unknown>>;
export function qualify(options?: {
  patch?: Buffer;
  evidence?: unknown;
  checkTypes?: boolean;
}): {
  candidate: Record<string, unknown>;
  activeSourceAuthor: string | null;
  client: string;
  caller: string;
};
