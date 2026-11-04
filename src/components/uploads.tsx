'use client';
import { useEffect, useRef, useState } from 'react';
import { sha256 } from '@noble/hashes/sha2.js';
import { api, json, type Row } from './api';
import { Errors, Notice } from './shared';

export function AssetList({ assets }: { assets: Row[] }) {
  return <div className="stack">{assets.map(asset => <article className="panel" key={asset.id}><h3>{asset.generated_name || asset.originalName || asset.original_name || 'Retained file'}</h3>{asset.role && <p>{String(asset.role).replaceAll('_',' ')}</p>}<p>Status: <strong>{asset.status}</strong> · {((asset.byteSize || asset.byte_size || 0) / 1048576).toFixed(1)} MB{asset.metadata?.wordCount !== undefined && ` · ${asset.metadata.wordCount} words`}{asset.metadata?.durationSeconds !== undefined && ` · ${Math.ceil(asset.metadata.durationSeconds)} seconds`}</p>{asset.status === 'ready' && !asset.trashed_at && <><details><summary>Preview file</summary>{String(asset.mimeType || asset.mime_type).startsWith('video/') ? <video controls preload="metadata" src={`/api/media/${asset.id}`} /> : String(asset.mimeType || asset.mime_type).startsWith('image/') ? <img alt={asset.originalName || asset.original_name || 'Submitted work'} src={`/api/media/${asset.id}`} /> : (asset.mimeType || asset.mime_type) === 'application/pdf' ? <iframe className="media-preview" title="Submitted document" src={`/api/media/${asset.id}`} /> : <p>Preview is not available for this file type. Use the download link.</p>}</details><a href={`/api/media/${asset.id}?download=1`}>Download original file</a></>}{['quarantined', 'failed'].includes(asset.status) && <Notice error>This file did not pass verification. Retry with a valid file or contact support.</Notice>}</article>)}</div>;
}
export function UploadForm({ submissionId, config, onChanged }: { submissionId: string; config: Row; onChanged: () => void }) {
  const [file, setFile] = useState<File | null>(null), [progress, setProgress] = useState(0), [stage, setStage] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState<unknown>(null);
  const [role,setRole]=useState(config.roles?.[0]?.id || '');
  const rules=config.roles?.find((item:Row)=>item.id===role)||config;
  const paused = useRef(false), xhr = useRef<XMLHttpRequest | null>(null);
  useEffect(() => () => { paused.current = true; xhr.current?.abort(); }, []);
  async function upload() {
    if (!file) return; setError(null); setBusy(true); paused.current = false;
    try {
      if (file.size > rules.maxBytes) throw new Error(`This file exceeds the ${(rules.maxBytes / 1048576).toFixed(0)} MB limit.`);
      if (file.type && rules.types?.length && !rules.types.includes(file.type)) throw new Error('This file type is not allowed by this competition.');
      setStage('Checking file requirements…');
      await checkBrowserMedia(file,rules);
      setStage('Checking file integrity…');
      const hasher = sha256.create();
      const chunkSize = 4 * 1024 * 1024;
      for (let offset = 0; offset < file.size; offset += chunkSize) {
        if (paused.current) return;
        hasher.update(new Uint8Array(await file.slice(offset, offset + chunkSize).arrayBuffer()));
        setStage(`Checking file integrity… ${Math.round(Math.min(offset + chunkSize, file.size) / file.size * 100)}%`);
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      const checksum = Array.from(hasher.digest(), b => b.toString(16).padStart(2, '0')).join('');
      if (paused.current) return;
      const key = `yes-upload:${submissionId}:${role}:${checksum}`;
      let previousState: Row | null = null;
      const previous = localStorage.getItem(key);
      if (previous) { try { previousState = await api<Row>(`/api/uploads/${previous}`); } catch { localStorage.removeItem(key); } }
      if (previousState?.status === 'failed') throw new Error('The previous upload could not be verified. Move that draft file to Trash below before uploading a replacement, or contact support to retry its verification.');
      const state: Row = !previousState || ['quarantined', 'cancelled'].includes(previousState.status)
        ? await api<Row>('/api/uploads/start', json('POST', { submissionId, originalName: file.name, byteSize: file.size, checksum, ...(role?{role}:{}) }))
        : previousState;
      if (!state?.id) throw new Error('The upload session could not be created. Please retry.');
      localStorage.setItem(key, state.id);
      if (state.status === 'ready') { setProgress(100); setStage('File verified and ready.'); localStorage.removeItem(key); onChanged(); return; }
      if (state.status === 'uploading' && !state.needsCompletion) {
        const completed = new Map<number, number>((state.parts || []).map((p: Row) => [p.partNumber, p.size]));
        let uploaded = Array.from(completed.values()).reduce((sum, size) => sum + size, 0);
        for (let part = 1; part <= state.partCount; part++) {
          if (paused.current) return;
          if (completed.has(part)) continue;
          setStage(`Uploading part ${part} of ${state.partCount}…`);
          const partBlob = file.slice((part - 1) * state.partSize, Math.min(part * state.partSize, file.size));
          const signed = await api<Row>(`/api/uploads/${state.id}/parts`, json('POST', { partNumber: part }));
          await new Promise<void>((resolve, reject) => {
            const request = new XMLHttpRequest(); xhr.current = request; request.open('PUT', signed.url);
            request.upload.onprogress = event => { if (event.lengthComputable) setProgress(Math.round((uploaded + event.loaded) / file.size * 100)); };
            request.onload = () => request.status >= 200 && request.status < 300 ? resolve() : reject(new Error('A file part could not be uploaded. Retry to resume from completed parts.'));
            request.onerror = () => reject(new Error('Upload interrupted. Check your connection and retry to resume.'));
            request.onabort = () => reject(new Error('Upload paused. Select Resume upload to continue.'));
            request.send(partBlob);
          });
          uploaded += partBlob.size;
        }
        if (paused.current) return;
      }
      if (state.status === 'uploading') await api(`/api/uploads/${state.id}/complete`, json('POST', {}));
      setProgress(100); setStage('Upload received. Verification is in progress; the file is not ready yet.'); onChanged();
      for (let attempt = 0; attempt < 30 && !paused.current; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const updated = await api<Row>(`/api/uploads/${state.id}`);
        if (updated.status === 'ready') { setStage('File verified and ready.'); localStorage.removeItem(key); onChanged(); return; }
        if (['failed', 'quarantined'].includes(updated.status)) throw new Error(updated.error || 'File verification failed. The file is not ready for submission.');
      }
      setStage('File verification is still in progress. Refresh file status before submitting.');
    } catch (e) { setError(e); onChanged(); } finally { setBusy(false); xhr.current = null; }
  }
  return <section className="panel"><h3>Upload your work</h3>
    {config.roles?.length>0&&<><label htmlFor="upload-role">File purpose</label><select id="upload-role" value={role} disabled={busy} onChange={e=>{setRole(e.target.value);setFile(null);setStage('');setError(null);}}>{config.roles.map((item:Row)=><option key={item.id} value={item.id}>{item.label}{item.minCount===0?' (optional)':' (required)'}</option>)}</select></>}
    <p>Accepted types: {rules.types?.join(', ')}. Maximum {(rules.maxBytes / 1048576).toFixed(0)} MB per file.{rules.maxDurationSeconds&&` Up to ${rules.maxDurationSeconds} seconds.`}{rules.maxHeight&&` Up to ${rules.maxHeight}p.`}{rules.orientation==='landscape'&&' Landscape orientation required.'}</p>
    {rules.minWords&&<p>Upload a typed PDF containing {rules.minWords}–{rules.maxWords} words. Its text is counted automatically after upload; you do not need to type it again.</p>}
    <label htmlFor="upload-file">Choose a file</label><input key={role} id="upload-file" type="file" disabled={busy} accept={rules.types?.join(',')} onChange={e => { setFile(e.target.files?.[0] || null); setStage(''); setProgress(0); }} /><Errors error={error} />
    {stage && <div role="status"><p>{stage}</p><progress aria-label="File upload progress" value={progress} max={100} /> <span>{progress}% transferred</span></div>}
    <div className="actions"><button type="button" onClick={upload} disabled={busy || !file}>{busy ? 'Uploading…' : 'Upload or resume file'}</button>{busy && <button type="button" className="secondary" onClick={() => { paused.current = true; xhr.current?.abort(); setStage('Upload paused. Completed parts are retained.'); }}>Pause</button>}<button type="button" className="secondary" onClick={onChanged}>Refresh file status</button></div><small>Keep this page open while uploading. To resume after reopening it, choose the same file and purpose. Files are ready only after server verification.</small></section>;
}

export function DraftAssetRemoval({ assets, onChanged }: { assets: Row[]; onChanged: () => void }) {
  const [error, setError] = useState<unknown>(null), [busy, setBusy] = useState(false);
  async function remove(e: React.FormEvent<HTMLFormElement>) { e.preventDefault(); setBusy(true); setError(null); const data = Object.fromEntries(new FormData(e.currentTarget)); try { await api(`/api/uploads/${data.assetId}/trash`, json('POST', { reason: data.reason })); onChanged(); } catch (e) { setError(e); } finally { setBusy(false); } }
  if (!assets.length) return null;
  return <details><summary>Replace or remove a draft file</summary><p>Move an unwanted or failed draft upload to Trash before uploading its replacement. The original remains retained for administration.</p><form className="form" onSubmit={remove}><Errors error={error} /><label htmlFor="asset-removal">File</label><select id="asset-removal" name="assetId" required>{assets.map(a => <option key={a.id} value={a.id}>{a.originalName || a.original_name} · {a.status}</option>)}</select><label htmlFor="asset-reason">Reason (required)</label><input id="asset-reason" name="reason" required minLength={3} /><div className="actions"><button className="secondary" disabled={busy}>{busy ? 'Moving…' : 'Move draft file to Trash'}</button></div></form></details>;
}

async function checkBrowserMedia(file:File,rules:Row):Promise<void>{
  if(!(file.type.startsWith('video/')||file.type.startsWith('image/'))||!(rules.maxDurationSeconds||rules.maxHeight||rules.orientation))return;
  const url=URL.createObjectURL(file);
  try{
    const metadata=await new Promise<{width:number;height:number;duration?:number}>((resolve,reject)=>{
      const element=file.type.startsWith('video/')?document.createElement('video'):new Image();
      const timer=window.setTimeout(()=>reject(new Error('The browser could not read this media file. Check that it opens correctly and retry.')),10000);
      const fail=()=>{clearTimeout(timer);reject(new Error('The browser could not read this media file. Check its format and retry.'));};
      element.onerror=fail;
      if(element instanceof HTMLVideoElement){element.preload='metadata';element.onloadedmetadata=()=>{clearTimeout(timer);resolve({width:element.videoWidth,height:element.videoHeight,duration:element.duration});};}
      else element.onload=()=>{clearTimeout(timer);resolve({width:element.naturalWidth,height:element.naturalHeight});};
      element.src=url;
    });
    if(rules.maxDurationSeconds&&(!Number.isFinite(metadata.duration)||metadata.duration!>rules.maxDurationSeconds))throw new Error(`The video must be no longer than ${rules.maxDurationSeconds} seconds.`);
    if(rules.orientation==='landscape'&&metadata.width<=metadata.height)throw new Error('Choose a landscape (horizontal) file.');
    const height=rules.orientation==='landscape-or-portrait'?Math.min(metadata.width,metadata.height):metadata.height;
    const width=rules.orientation==='landscape-or-portrait'?Math.max(metadata.width,metadata.height):metadata.width;
    if(rules.maxHeight&&(height>rules.maxHeight||width>Math.ceil(rules.maxHeight*16/9)))throw new Error(`Resolution must not exceed ${rules.maxHeight}p.`);
  }finally{URL.revokeObjectURL(url);}
}
