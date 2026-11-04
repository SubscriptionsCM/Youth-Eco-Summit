import { createHash } from 'node:crypto';
import type { Db } from './db';
import { AppError, id } from './core';
import { partnerEnquirySchema, partnerConsent } from '../domain/partner-enquiry';

export async function createPartnerEnquiry(db: Db, input: unknown) {
  const value = partnerEnquirySchema.parse(input);
  if (value.website) throw new AppError(422, 'Please leave the website field empty.');
  const fingerprint = createHash('sha256').update(JSON.stringify([value.organization, value.contactName, value.email, value.phone, value.interest, value.message, value.consent])).digest('hex');
  return db.transaction(async tx => {
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`partner-submit:${value.submissionId}`]);
    const { rows: [existing] } = await tx.query('SELECT reference,request_fingerprint FROM partner_enquiries WHERE submission_key=$1', [value.submissionId]);
    if (existing) {
      if (existing.request_fingerprint !== fingerprint) throw new AppError(409, 'This enquiry was already sent. Start a new enquiry to send different details.');
      return { reference: existing.reference, status: 'new' };
    }
    const { rows: [privacy] } = await tx.query("SELECT title,body,updated_at FROM site_content WHERE key='privacy' AND approved AND length(trim(body))>0 FOR SHARE");
    if (!privacy) throw new AppError(503, 'Partner enquiries will open when the privacy information is published.');
    // Serialize the per-contact limit without storing IP addresses or fingerprints.
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`partner:${value.email}`]);
    const { rows: [recent] } = await tx.query("SELECT count(*)::int total FROM partner_enquiries WHERE email=$1 AND created_at>now()-interval '1 day'", [value.email]);
    if (recent.total >= 5) throw new AppError(429, 'Your enquiries have been received. Please wait before sending another.');
    const reference = `PART-${id().slice(0, 12).toUpperCase()}`;
    await tx.query(`INSERT INTO partner_enquiries(id,reference,organization,contact_name,email,phone,interest,message,consent_wording,privacy_snapshot,submission_key,request_fingerprint)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [id(), reference, value.organization, value.contactName, value.email, value.phone, value.interest, value.message, partnerConsent, JSON.stringify(privacy), value.submissionId, fingerprint]);
    return { reference, status: 'new' };
  });
}
