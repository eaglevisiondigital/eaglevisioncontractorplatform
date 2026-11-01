/** Not connected to an HTTP route. Real ingestion/playback fail closed. */
export const mediaPolicy = Object.freeze({
  imageBytes: 3 * 1024 * 1024,
  videoBytes: 250 * 1024 * 1024,
  dailyBytes: 1024 * 1024 * 1024,
  storedBytes: 10 * 1024 * 1024 * 1024,
  videoSeconds: 300,
  maxWidth: 3840,
  maxHeight: 2160,
  maxFps: 30,
  playbackSeconds: 60,
  ingestionEnabled: false,
  playbackEnabled: false,
});
export interface MediaManifest {
  organizationId: string;
  visitId: string;
  filename: string;
  mime: string;
  bytes: number;
  sha256: string;
  kind: 'photo' | 'video' | 'drone_photo' | 'drone_video';
  phase: 'before' | 'during' | 'after';
  visibility: 'internal' | 'customer';
}
export function validateMediaManifest(
  m: MediaManifest,
  quota: { daily: number; stored: number },
) {
  const video = m.kind === 'video' || m.kind === 'drone_video';
  if (
    !m.organizationId ||
    !m.visitId ||
    !['photo', 'video', 'drone_photo', 'drone_video'].includes(m.kind) ||
    !['internal', 'customer'].includes(m.visibility) ||
    !['before', 'during', 'after'].includes(m.phase) ||
    !m.filename.trim() ||
    m.filename.length > 200 ||
    m.filename.includes('/') ||
    m.filename.includes(String.fromCharCode(92)) ||
    [...m.filename].some((c) => c.charCodeAt(0) < 32) ||
    !/^[a-f0-9]{64}$/.test(m.sha256) ||
    !(
      video
        ? ['video/mp4', 'video/quicktime']
        : ['image/jpeg', 'image/png', 'image/webp']
    ).includes(m.mime) ||
    !Number.isSafeInteger(m.bytes) ||
    m.bytes < 8 ||
    m.bytes > (video ? mediaPolicy.videoBytes : mediaPolicy.imageBytes)
  )
    throw Error('Media metadata denied');
  if (
    ![quota.daily, quota.stored].every(
      (n) => Number.isSafeInteger(n) && n >= 0,
    ) ||
    quota.daily + m.bytes > mediaPolicy.dailyBytes ||
    quota.stored + m.bytes > mediaPolicy.storedBytes
  )
    throw Error('Media quota exceeded');
  return {
    ...m,
    status: 'quarantined' as const,
    staffAccess: false,
    customerAccess: false,
  };
}
export async function ingestPropertyMedia(): Promise<never> {
  throw Error(
    '503: Media ingestion requires approved scanning, validators, isolated storage and worker acceptance',
  );
}
export async function issuePropertyPlayback(): Promise<never> {
  throw Error(
    '503: Playback unavailable until exact-object publication, scanning and every-segment authorization pass review',
  );
}
export interface VideoProcessingPort {
  // Must run outside request process: pinned codec/parser, nonroot/read-only,
  // 2CPU/1GiB/32PIDs/512MiB tmpfs,180s hard kill, fixed egress; no external URLs.
  inspectAndTranscode(input: Readonly<MediaManifest>): Promise<{
    originalSha256: string;
    derivativeSha256: string;
    scannerEvidenceSha256: string;
    validatorVersion: string;
    durationSeconds: number;
    width: number;
    height: number;
    fps: number;
  }>;
}
