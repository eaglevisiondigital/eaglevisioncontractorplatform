export function check(root?: string): Readonly<{
  classification: string;
  operationalReady: false;
  linksEnabled: false;
  paymentsAuthorized: false;
  files: number;
}>;
