import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = (process.env.APP_ORIGIN ?? 'https://youthecosummit.com').replace(/\/$/, '');
  const paths = ['', '/about', '/students', '/parents', '/teachers-schools', '/competitions', '/experience', '/awards', '/partners', '/resources', '/how-to-participate', '/faq', '/schools', '/showcase', '/contact', '/get-involved', '/partners/enquire', '/privacy', '/terms'];
  return paths.map(path => ({ url: origin + path }));
}
