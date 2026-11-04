import type { MetadataRoute } from 'next';
export default function robots(): MetadataRoute.Robots {
  const origin = (process.env.APP_ORIGIN || 'https://youthecosummit.com').replace(/\/$/, '');
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/admin/', '/judge/', '/dashboard', '/entries/', '/invite', '/recover', '/teams/'] },
    sitemap: `${origin}/sitemap.xml`,
  };
}
