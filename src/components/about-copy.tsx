'use client';
import { contentFor, type PublicConfig } from './api';
import { useResource } from './shared';

export function AboutCopy() {
  const config = useResource<PublicConfig>('/api/public/config');
  const approved = contentFor(config.data, 'about');
  return approved?.body?.trim() ? <><h2>{approved.title}</h2><div className="prose">{approved.body}</div></> : <><h2>From awareness<br /><em>to action.</em></h2><p className="editorial-lead">Learning matters more when students can use it.</p><p>The Summit helps young people question problems, express perspectives and turn understanding into meaningful work.</p></>;
}
