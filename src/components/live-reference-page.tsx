import 'server-only';
import reference from '@/data/live-presentation.json';
import { LiveReferenceContent } from './live-reference-content';

/** Reviewed, versioned public content only. Transactional routes retain their own components. */
export function LiveReferencePage({ path }: { path: keyof typeof reference.pages }) {
  const page = reference.pages[path];
  return <><style data-live-route={path} dangerouslySetInnerHTML={{ __html: page.css }} /><LiveReferenceContent html={page.html} /></>;
}
