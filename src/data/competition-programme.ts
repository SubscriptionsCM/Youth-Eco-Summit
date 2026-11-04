import { competitionGuidelines2027 } from './guidelines-2027';

// Existing summit photography supports the team-supplied 2027 competition programme.
const visuals: Record<string, { image: string | null; position: string; alt: string }> = {
  'open-letter': { image: 'gallery-p2175892.jpg', position: '50% 50%', alt: 'Students sitting in the summit audience with notebooks' },
  'article-writing': { image: null, position: '50% 65%', alt: '' },
  'blog-writing': { image: null, position: '65% 35%', alt: '' },
  'case-study': { image: 'gallery-p2176488.jpg', position: '55% 45%', alt: 'Students exploring a reuse and recycling display together' },
  'short-film-making': { image: null, position: '40% 42%', alt: '' },
  'spoken-word': { image: 'gallery-_mai0896.jpg', position: '52% 43%', alt: 'A student speaking into a microphone through a cardboard television prop' },
  painting: { image: 'gallery-p2176237.jpg', position: '30% 48%', alt: 'A young participant painting a design at a summit activity' },
  'digital-art': { image: null, position: '50% 50%', alt: '' },
  'waste-to-art': { image: 'gallery-p2176389.jpg', position: '32% 60%', alt: 'Students working with materials at a hands-on summit workshop' },
  'eco-business-model': { image: 'gallery-p2176488.jpg', position: '55% 45%', alt: 'Students beside reuse and recycling displays at the summit' },
};

export const competitionProgramme2027 = competitionGuidelines2027.map(guideline => ({
  ...guideline, format: guideline.category, ...visuals[guideline.slug],
}));
