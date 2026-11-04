'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { api, json, type PublicConfig, type Row } from './api';
import { Errors, Field, Notice, PageTitle, ResourceState, useResource } from './shared';
import { partnerConsent } from '@/data/partner-enquiry';
import './partner-enquiry.css';

export function PartnerEnquiryPage() {
  const submissionId = useRef<string | null>(null);
  const config = useResource<PublicConfig>('/api/public/config');
  const [busy, setBusy] = useState(false), [error, setError] = useState<unknown>(null), [receipt, setReceipt] = useState<Row | null>(null);
  const available = Boolean(config.data?.configured && config.data.content.some(item => item.key === 'privacy' && item.body?.trim()));
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || !available) return;
    setBusy(true); setError(null);
    try { const data = Object.fromEntries(new FormData(event.currentTarget)); setReceipt(await api('/api/public/partner-enquiries', json('POST', { ...data, submissionId: submissionId.current ??= crypto.randomUUID(), consent: data.consent === 'on' }))); }
    catch (caught) { setError(caught); } finally { setBusy(false); }
  }
  return <div className="partner-enquiry"><PageTitle title="Partner with Youth Eco Summit">Bring your organization’s expertise, resources or network to the next generation of environmental changemakers.</PageTitle><div className="partner-enquiry-layout"><aside className="partner-enquiry-intro"><span className="eyebrow">GET INVOLVED</span><h2>Make room for young ideas.</h2><p>Tell us where you see a connection. The Youth Eco Summit team will review your enquiry.</p><ul><li>Programme and learning collaborations</li><li>Resources and sponsorship</li><li>Community and outreach partnerships</li></ul><Link href="/get-involved">Explore ways to get involved →</Link></aside><section className="panel"><h2>Your partnership enquiry</h2>{receipt ? <div className="receipt" role="status"><h3>Enquiry received</h3><p>Your reference is <strong>{receipt.reference}</strong>.</p><p>The team will review your message and use the contact details you provided to respond.</p><Link href="/">Back to the home page</Link></div> : <><ResourceState {...config} retry={config.reload} />{!config.loading && !config.error && !available && <Notice>Enquiries are not being accepted in this preview. You can review the form below.</Notice>}<form className="form" onSubmit={submit} onChange={() => { submissionId.current = null; }}><Errors error={error} /><Field name="organization" title="Organization" required minLength={2} maxLength={200} autoComplete="organization" /><Field name="contactName" title="Your name" required minLength={2} maxLength={150} autoComplete="name" /><div className="field-row"><Field name="email" title="Work email" type="email" required maxLength={254} autoComplete="email" /><Field name="phone" title="Phone (optional)" type="tel" maxLength={30} autoComplete="tel" /></div><Field name="interest" title="How would you like to collaborate?" required><select name="interest" required defaultValue=""><option value="" disabled>Select an area</option><option value="programme">Programme and learning</option><option value="resources">Resources and sponsorship</option><option value="outreach">Community and outreach</option><option value="other">Another idea</option></select></Field><Field name="message" title="Tell us about your idea" required hint="20–3,000 characters. Please do not include student or sensitive personal information."><textarea name="message" required minLength={20} maxLength={3000} rows={5} /></Field><div className="partner-enquiry-trap" aria-hidden="true"><label>Leave this field empty<input name="website" tabIndex={-1} autoComplete="off" /></label></div><label className="check-label"><input type="checkbox" name="consent" required />{partnerConsent}</label><p><Link href="/privacy">Read our privacy information</Link>.</p><button disabled={busy || !available}>{busy ? 'Sending enquiry…' : 'Send enquiry →'}</button></form></>}</section></div></div>;
}
