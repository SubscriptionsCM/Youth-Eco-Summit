import type { Metadata } from 'next';
import { SummitHome } from '@/components/summit-home';
import { socialLinks } from '@/data/summit-content';

export const metadata: Metadata = {
  alternates: { canonical: '/' },
  description: 'Youth Eco Summit 2027: student-led environmental ideas, competitions, 15 awards and hands-on experiences. Explore speakers, partners and previous winners.',
};

export default function Page() {
  const origin = (process.env.APP_ORIGIN || 'https://youthecosummit.com').replace(/\/$/, '');
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', '@id': `${origin}/#organization`, name: 'Youth Eco Summit', url: origin, logo: `${origin}/images/logo.png`, sameAs: socialLinks.map(link => link.href) },
      { '@type': 'WebSite', '@id': `${origin}/#website`, name: 'Youth Eco Summit', url: origin, publisher: { '@id': `${origin}/#organization` } },
    ],
  };
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }} /><SummitHome /></>;
}
