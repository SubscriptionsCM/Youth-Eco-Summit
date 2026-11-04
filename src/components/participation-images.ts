export type ParticipationIllustration = 'find-school' | 'register' | 'choose-challenge' | 'submit-work' | 'explore-summit';

/** Unmodified photographs from the Youth Eco Summit archive; crops are presentation only. */
export const participationImages = {
  'find-school': {
    src: '/images/participation/photos/p2176488.jpg',
    width: 3333,
    height: 2222,
    position: '61% 39%',
    zoom: 1.45,
    subject: 'Three school students at the Youth Eco Summit recycling display',
  },
  register: {
    src: '/images/participation/photos/p2175892.jpg',
    width: 3333,
    height: 2222,
    position: '56% 78%',
    zoom: 1.35,
    subject: 'Students with their notebooks in the summit auditorium',
  },
  'choose-challenge': {
    src: '/images/participation/photos/p2176389.jpg',
    width: 3333,
    height: 2222,
    position: '5% 100%',
    zoom: 1.5,
    subject: 'School students taking part in a hands-on environmental workshop',
  },
  'submit-work': {
    src: '/images/participation/photos/p2176245.jpg',
    width: 3333,
    height: 2222,
    position: '56% 69%',
    zoom: 1.7,
    subject: 'A student working with paper at the summit activity counter',
  },
  'explore-summit': {
    src: '/images/summit/gallery-_mai0896.jpg',
    width: 1024,
    height: 682,
    position: '50% 50%',
    zoom: 1,
    subject: 'A young participant speaking into a microphone through a cardboard television prop',
  },
} as const satisfies Record<ParticipationIllustration, {
  src: string;
  width: number;
  height: number;
  position: string;
  zoom: number;
  subject: string;
}>;
