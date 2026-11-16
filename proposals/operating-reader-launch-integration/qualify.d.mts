export interface SourceFixture {
  mode: string;
  bytes: Buffer;
}
export function qualifyReaderIntegration(
  root: string,
  boundary?: (stage: 'after-capture' | 'after-compose') => void | Promise<void>,
): Promise<
  Readonly<{
    classification: 'UNAPPLIED_DEVELOPMENT_SOURCE_ONLY';
    base: string;
    author: string;
    beforeTree: string;
    afterTree: string;
    additions: 11;
    patchSHA256: string;
    operationalReady: false;
    installationAuthorized: false;
    launchIntegrationAuthorized: false;
    beforeFixture: Record<string, SourceFixture>;
    afterFixture: Record<string, SourceFixture>;
  }>
>;
export function verifyReaderIntegrationImage(
  root: string,
  boundary?: (stage: 'after-image-audit') => void | Promise<void>,
): Promise<Readonly<{ tree: string; files: 2479; operationalReady: false }>>;
