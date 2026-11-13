export function regular(path: string, base?: string): Buffer;
export function git(...args: string[]): Buffer;
export function inspect(options?: {
  read?: (path: string) => Buffer;
  metadata?: (...args: string[]) => Buffer;
  patch?: Buffer;
  record?: unknown;
}): Readonly<{
  frame: string;
  canonicalChanged: false;
  admissionAuthorized: false;
}>;
export function qualify(): Promise<{
  original428: string;
  proposedCycle9: string;
  helperMutantsDenied: number;
  canonicalChanged: false;
  admissionAuthorized: false;
  cycle24Changed: false;
  frame: string;
}>;
