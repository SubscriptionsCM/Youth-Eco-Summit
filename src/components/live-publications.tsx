'use client';
import { Empty, ResourceState, useResource } from './shared';

type PublishedAsset = { id: string; mime_type: string };
type Publication = { id: string; title: string; summary: string; award?: string | null; competition: string; assets?: PublishedAsset[] };

/** Keep the existing approved-publication API live inside the source-matched presentation. */
export function LivePublications() {
  const resource = useResource<{ items: Publication[] }>('/api/public/showcase');
  return <><ResourceState {...resource} retry={resource.reload} />{resource.data && !resource.loading && !resource.error && (resource.data.items.length ? <div className="editorial-publications">{resource.data.items.map(publication => <article className="editorial-publication" key={publication.id}><p className="editorial-eyebrow">{publication.competition}</p><h3>{publication.title}</h3>{publication.award && <p className="editorial-publication-award">Award: {publication.award}</p>}<p className="prose">{publication.summary}</p><div className="stack">{(publication.assets || []).map(asset => {
    const path = `/api/public/showcase/${encodeURIComponent(publication.id)}/media/${encodeURIComponent(asset.id)}`;
    return <div key={asset.id}>{asset.mime_type.startsWith('image/') ? <img src={path} alt={publication.title} loading="lazy" /> : asset.mime_type.startsWith('video/') ? <video controls preload="metadata" aria-label={publication.title} src={path}>Your browser cannot play this video. Use the file link below.</video> : null}<p><a href={path}>{asset.mime_type === 'application/pdf' ? 'Open approved document' : asset.mime_type.startsWith('video/') ? 'Open approved video' : asset.mime_type.startsWith('image/') ? 'Open approved image' : 'Download approved file'}</a></p></div>;
  })}</div></article>)}</div> : <Empty><h3>The next ideas belong here.</h3><p>No student work has been published yet. Only entries approved for public sharing will appear in this showcase.</p></Empty>)}</>;
}
