import Image from 'next/image';
import { participationImages, type ParticipationIllustration } from './participation-images';
import '../app/participation-photos.css';

export type { ParticipationIllustration } from './participation-images';

/** The adjacent heading supplies meaning; the photograph is a decorative archive image. */
export function ParticipationArt({ name, priority = false, className = '', sizes = '(max-width: 760px) 92vw, 48vw' }: {
  name: ParticipationIllustration;
  priority?: boolean;
  className?: string;
  sizes?: string;
}) {
  const photo = participationImages[name];

  return <span className={`participation-art participation-photo-art participation-photo-art--${name} ${className}`} aria-hidden="true" data-enter-media>
    <span className="participation-photo-paper" />
    <span className="participation-photo-corner" />
    <span className="participation-photo-mat">
      <span className="participation-photo-window">
        <Image
          src={photo.src}
          alt=""
          fill
          sizes={sizes}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          style={{ objectFit: 'cover', objectPosition: photo.position, transform: `scale(${photo.zoom})`, transformOrigin: photo.position }}
        />
      </span>
    </span>
  </span>;
}
