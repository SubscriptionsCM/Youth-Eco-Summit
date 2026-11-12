import 'server-only';
import reference from '@/data/live-presentation.json';
import { LiveReferenceContent } from './live-reference-content';

/** Reviewed, versioned public content only. Transactional routes retain their own components. */
export function LiveReferencePage({ path }: { path: keyof typeof reference.pages }) {
  return <LiveReferenceContent html={reference.pages[path].html} />;
}
