export const metadata = { title: 'Contact and support' };
export const dynamic = 'force-dynamic';
import { ContentPage } from '@/components/public-pages';
export default function Page() { return <ContentPage slug="contact" contactFormEnabled={process.env.PORTAL_REFERENCE_FORMS==='true'} />; }
