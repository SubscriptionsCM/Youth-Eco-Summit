import type { Metadata } from 'next';
import { Manrope } from 'next/font/google';
import { SiteShell } from '@/components/site-shell';
import brand from '@/data/live-brand.json';
import './globals.css';
import './campaign.css';
import './local-preview.css';
import './live-presentation.css';
import './live-presentation-controls.css';
const manrope = Manrope({ subsets: ['latin'], display: 'swap', variable: '--font-manrope' });
export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_ORIGIN || 'https://youthecosummit.com'),
  title: { default: 'Youth Eco Summit 2027 — Your ideas. Bigger stage.', template: '%s | Youth Eco Summit' },
  description: 'Asia’s largest youth-led platform. Youth Eco Summit 2027: Waste segregation, the need of the hour.',
  icons: { icon: brand.logo },
  openGraph: { title: 'Youth Eco Summit 2027', description: 'Your ideas. Bigger stage. Asia’s largest youth-led platform.', type: 'website', siteName: 'Youth Eco Summit', images: [{ url: brand.socialImage, width: 1400, height: 933, alt: 'Students at Youth Eco Summit' }] },
  twitter: { card: 'summary_large_image', title: 'Youth Eco Summit 2027', description: 'Your ideas. Bigger stage.', images: [brand.socialImage] },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const localPreview = process.env.NODE_ENV !== 'production' && process.env.YES_LOCAL_RUNTIME === 'true';
  return <html lang="en" className={manrope.variable}><body>{localPreview && <aside className="local-preview-notice" aria-label="Local test environment"><strong>Local test environment</strong><span>Test registrations and files stay on this computer. SMS and email are captured locally.</span></aside>}<SiteShell>{children}</SiteShell></body></html>;
}
