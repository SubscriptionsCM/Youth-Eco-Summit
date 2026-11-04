'use client';
import { Empty, ResourceState, useResource } from './shared';
import { EditorialClosing, EditorialHero } from './editorial-pages';
import { CampaignMotion } from './campaign-motion';

type PublishedAsset = { id: string; mime_type: string };
type Publication = { id: string; title: string; summary: string; award?: string | null; competition: string; assets?: PublishedAsset[] };

export function ShowcasePage() {
  const resource = useResource<{ items: Publication[] }>('/api/public/showcase');
  return <CampaignMotion><div className="editorial-page editorial-showcase"><EditorialHero eyebrow="Student work" title="See what students see." text="Young people notice things adults often miss." image="creative-cutout.webp" alt="A student expressing an environmental idea through art at the Summit" tone="yellow" cta={{label:'Take part',href:'/register'}} /><section className="editorial-container editorial-section"><div className="editorial-section-heading" data-reveal><p className="editorial-eyebrow">The showcase</p><h2>Their ideas. Their voice.</h2><p>Explore winning work and ideas beyond the awards: student stories, artwork, films, projects and environmental thinking from across the Summit community.</p></div><ResourceState {...resource} retry={resource.reload} />{resource.data && !resource.loading && !resource.error && (resource.data.items.length ? <div className="editorial-publications">{resource.data.items.map(publication => <article className="editorial-publication" key={publication.id}><p className="editorial-eyebrow">{publication.competition}</p><h3>{publication.title}</h3>{publication.award && <p className="editorial-publication-award">Award: {publication.award}</p>}<p className="prose">{publication.summary}</p><div className="stack">{(publication.assets || []).map(asset => <PublishedMedia key={asset.id} publication={publication} asset={asset} />)}</div></article>)}</div> : <Empty><h3>The next ideas belong here.</h3><p>No student work has been published yet. Only entries approved for public sharing will appear in this showcase.</p></Empty>)}</section><EditorialClosing title="Your work could be next." text="Create something worth sharing." label="Take part" href="/register" /></div></CampaignMotion>;
}

function PublishedMedia({ publication, asset }: { publication: Publication; asset: PublishedAsset }) {
  const path = `/api/public/showcase/${encodeURIComponent(publication.id)}/media/${encodeURIComponent(asset.id)}`;
  return <div>{asset.mime_type.startsWith('image/') ? <img src={path} alt={publication.title} loading="lazy" /> : asset.mime_type.startsWith('video/') ? <video controls preload="metadata" aria-label={publication.title} src={path}>Your browser cannot play this video. Use the file link below.</video> : null}<p><a href={path}>{asset.mime_type === 'application/pdf' ? 'Open approved document' : asset.mime_type.startsWith('video/') ? 'Open approved video' : asset.mime_type.startsWith('image/') ? 'Open approved image' : 'Download approved file'}</a></p></div>;
}
