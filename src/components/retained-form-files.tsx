'use client';
import { useState } from 'react';
import { api, json, type Row } from './api';
import { AuthGate, Errors, Notice, PageTitle } from './shared';

export function RetainedFileDownload({ fileId, token, label = 'Download submitted file' }: { fileId: string; token?: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  async function download() {
    setBusy(true);
    setError(null);
    try {
      const result = await api<Row>(`/api/forms/files/${fileId}/download`, {
        ...json('POST', {}), headers: token ? { 'X-Draft-Key': token } : {},
      });
      window.location.assign(result.url);
    } catch (error) { setError(error); }
    finally { setBusy(false); }
  }
  return <><button type="button" className="secondary" disabled={busy} onClick={download}>{busy ? 'Preparing download…' : label}</button><Errors error={error}/></>;
}

export function RetainedFormFiles({ files = [], token }: { files?: Row[]; token?: string }) {
  const verified = files.filter(file => file.status === 'ready');
  if (!verified.length) return null;
  return <section><h3>Retained files</h3><ul>{verified.map(file => <li key={file.id}><span>{file.filename}</span> <RetainedFileDownload fileId={file.id} token={token}/></li>)}</ul></section>;
}

export function RetainedFilePage({ fileId }: { fileId: string }) {
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(fileId)) return <Notice error>Invalid file link.</Notice>;
  return <AuthGate roles={['participant', 'owner', 'admin']}>{() => <><PageTitle title="Submitted file">Sign in with the account that owns this submission or an authorized staff account.</PageTitle><section className="panel"><RetainedFileDownload fileId={fileId}/></section></>}</AuthGate>;
}
