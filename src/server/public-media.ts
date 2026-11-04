import { Readable } from 'node:stream';
import { z } from 'zod';
import { db, type Db } from './db';
import { objectStore } from './storage/provider';
import { anonymousFilename, parseRange, safeDisposition } from './storage/validation';

// Use the same live approval checks for gallery metadata and every media request.
// Consent is separate from participation consent and includes the lead even if
// legacy data omitted the lead from submission_members.
const publicApproval = `pub.active AND pub.revision=s.revision AND s.revision>0
 AND s.state<>'draft' AND s.trashed_at IS NULL AND NOT s.purging
 AND NOT EXISTS (
  SELECT 1 FROM (
   SELECT s.student_participation_id AS participation_id
   UNION SELECT m.participation_id FROM submission_members m WHERE m.submission_id=s.id
  ) members
  LEFT JOIN student_participations p ON p.id=members.participation_id
  LEFT JOIN students st ON st.id=p.student_id
  LEFT JOIN schools sc ON sc.id=p.school_id
  LEFT JOIN LATERAL (
   SELECT accepted FROM consents
   WHERE student_id=p.student_id AND edition_id=c.edition_id AND purpose='publication'
   ORDER BY created_at DESC,id DESC LIMIT 1
  ) consent ON true
  WHERE p.id IS NULL OR st.id IS NULL OR sc.id IS NULL
   OR p.edition_id<>c.edition_id OR p.trashed_at IS NOT NULL
   OR st.trashed_at IS NOT NULL OR st.purging
   OR sc.trashed_at IS NOT NULL OR sc.purging
   OR consent.accepted IS DISTINCT FROM true
 )`;

const approvedAsset = `a.submission_id=s.id AND a.revision=pub.revision
 AND a.status='ready' AND a.trashed_at IS NULL AND pub.asset_ids ? a.id::text
 AND EXISTS(SELECT 1 FROM submission_revisions r WHERE r.submission_id=s.id AND r.version=pub.revision AND r.asset_ids ? a.id::text)`;

export async function showcaseList(database: Db) {
  const { rows } = await database.query(`SELECT pub.id,pub.title,pub.summary,pub.award,c.title AS competition,
   COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'mime_type',a.mime_type) ORDER BY a.created_at,a.id)
    FROM assets a WHERE ${approvedAsset}), '[]'::jsonb) AS assets
   FROM publications pub JOIN submissions s ON s.id=pub.submission_id
   JOIN competitions c ON c.id=s.competition_id
   WHERE ${publicApproval} ORDER BY pub.created_at DESC,pub.id DESC LIMIT 100`);
  return rows;
}

const metadata = z.object({
  mime_type: z.string().regex(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i),
  byte_size: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  storage_key: z.string().min(1), storage_version: z.string().nullish(), storage_etag: z.string().nullish(),
}).refine(value => !!(value.storage_version || value.storage_etag));

function responseHeaders() {
  return new Headers({ 'Cache-Control': 'private, no-store, max-age=0', Pragma: 'no-cache',
    'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox",
    'Referrer-Policy': 'no-referrer' });
}

export async function publicMedia(request: Request, publicationId: string, assetId: string): Promise<Response> {
  const headers = responseHeaders();
  const unavailable = () => new Response(null, { status: 404, headers });
  if (!['GET', 'HEAD'].includes(request.method) || !z.uuid().safeParse(publicationId).success || !z.uuid().safeParse(assetId).success) return unavailable();
  const { rows: [row] } = await db.query(`SELECT a.mime_type,a.byte_size,a.storage_key,a.storage_version,a.storage_etag
   FROM publications pub JOIN submissions s ON s.id=pub.submission_id
   JOIN competitions c ON c.id=s.competition_id JOIN assets a ON ${approvedAsset}
   WHERE pub.id=$1::uuid AND a.id=$2::uuid AND ${publicApproval}`, [publicationId, assetId]);
  const parsed = metadata.safeParse(row);
  if (!parsed.success) return unavailable();
  const asset = parsed.data;
  let range: { start: number; end: number } | undefined;
  if (request.headers.has('range')) {
    try { range = parseRange(request.headers.get('range')!, asset.byte_size); }
    catch { headers.set('Content-Range', `bytes */${asset.byte_size}`); return new Response(null, { status: 416, headers }); }
  }
  headers.set('Content-Type', asset.mime_type);
  headers.set('Content-Disposition', safeDisposition(asset.mime_type, anonymousFilename(asset.mime_type), new URL(request.url).searchParams.get('download') === '1'));
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Content-Length', String(range ? range.end - range.start + 1 : asset.byte_size));
  if (range) headers.set('Content-Range', `bytes ${range.start}-${range.end}/${asset.byte_size}`);
  const status = range ? 206 : 200;
  if (request.method === 'HEAD') return new Response(null, { status, headers });
  // The verified version/ETag pins the public stream to the bytes reviewed.
  const object = await objectStore().read(asset.storage_key, asset.storage_version ?? undefined, asset.storage_etag ?? undefined, range ? `bytes=${range.start}-${range.end}` : undefined);
  if (!object.Body) return new Response(null, { status: 503, headers: responseHeaders() });
  return new Response(Readable.toWeb(Readable.from(object.Body as AsyncIterable<Uint8Array>)) as ReadableStream<Uint8Array>, { status, headers });
}
