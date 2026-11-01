// Deliberately fail closed: no request body, file, or provider call is processed until
// the scanner/validator + least-privilege quarantine worker are provisioned and validated.
export default async function handler() {
  return Response.json(
    {
      error:
        'Live material ingestion is unavailable. Approved malware scanning, content validation and isolated worker configuration are required.',
    },
    {
      status: 503,
      headers: {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  );
}
export const config = { path: '/api/material-import' };
