'use client';

import Image from 'next/image';
import Link from 'next/link';
import { SummitCarousel } from './summit-carousel';
import {
  partners,
  speakers,
  expectations,
  winnerDocuments,
  galleryImages,
  pressLinks,
  socialLinks,
} from '@/data/summit-content';
import '@/app/summit-sections.css';

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return <p className="summit-eyebrow"><span aria-hidden="true" />{children}</p>;
}

function OutwardArrow() {
  return <span className="summit-arrow" aria-hidden="true">→</span>;
}

export function PartnerStrip() {
  return (
    <section className="summit-partners" aria-labelledby="summit-partners-title">
      <div className="campaign-container summit-partners-heading">
        <div>
          <p className="summit-eyebrow">Across summit editions</p>
          <h2 id="summit-partners-title">Our partners & allies.</h2>
        </div>
      </div>
      <div className="campaign-container">
        <SummitCarousel label="Partners" className="summit-partner-carousel" autoplay>
          {partners.map(partner => <div className="summit-partner-logo" key={partner.name}><Image src={partner.image} alt={partner.name} fill loading="eager" draggable={false} sizes="(max-width: 600px) 240px, 340px" /></div>)}
        </SummitCarousel>
      </div>
    </section>
  );
}

export function SummitExpectations() {
  return (
    <section className="summit-expectations" aria-labelledby="summit-expectations-title" id="summit-expectations">
      <div className="campaign-container section-space">
        <div className="summit-heading-row" data-reveal>
          <div><SectionEyebrow>The 2027 experience</SectionEyebrow><h2 id="summit-expectations-title">What to expect at<br/><em>Youth Eco Summit 2027.</em></h2></div>
          <p>Student-led talks, interactive workshops and creative ideas around waste segregation, e-waste and a circular future.</p>
        </div>
        <SummitCarousel label="Summit experiences" className="summit-expectation-carousel">
          {expectations.map((item, index) => (
            <article className="summit-expectation-card" key={item.title}>
              <div className="summit-expectation-photo"><Image src={item.image} alt={item.title} fill draggable={false} sizes="(max-width: 600px) 80vw, (max-width: 1000px) 45vw, 30vw" /></div>
              <div className="summit-expectation-copy"><span className="summit-card-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><h3>{item.title}</h3><p>{item.text}</p></div>
            </article>
          ))}
        </SummitCarousel>
        <div className="summit-expectation-footer"><p>Photographs from previous summit editions.</p><Link className="text-link summit-section-link" href="/experience">Explore the summit experience <OutwardArrow /></Link></div>
      </div>
    </section>
  );
}

export function SummitSpeakers() {
  return (
    <section className="summit-speakers campaign-container section-space" aria-labelledby="summit-speakers-title" id="speakers-2026">
      <div className="summit-heading-row" data-reveal>
        <div><SectionEyebrow>On the stage · 2026</SectionEyebrow><h2 id="summit-speakers-title">The people behind<br/><em>the conversations.</em></h2></div>
        <div><p>Meet the speakers from Youth Eco Summit 2026.</p><a className="text-link" href="https://www.youtube.com/@Youthecosummit" target="_blank" rel="noreferrer">Explore summit talks on YouTube <OutwardArrow /></a></div>
      </div>
      <SummitCarousel label="2026 speakers" className="summit-speaker-carousel">
        {speakers.map(speaker => (
          <a className="summit-speaker-card" href={speaker.href} target="_blank" rel="noreferrer" key={speaker.name} draggable={false}>
            <div className="summit-speaker-photo"><Image src={speaker.image} alt={speaker.name} fill draggable={false} sizes="(max-width: 600px) 66vw, (max-width: 1000px) 30vw, 22vw" /></div>
            <div className="summit-speaker-caption"><div><h3>{speaker.name}</h3><p>{speaker.role}</p></div><OutwardArrow /></div>
            <span className="summit-screenreader">Explore summit talks on the official YouTube channel, opens in a new tab</span>
          </a>
        ))}
      </SummitCarousel>
    </section>
  );
}

export function PreviousWinners() {
  return (
    <section className="summit-winners" aria-labelledby="summit-winners-title" id="previous-winners">
      <div className="campaign-container section-space">
        <div className="summit-heading-row" data-reveal>
          <div><SectionEyebrow>Celebrating young talent</SectionEyebrow><h2 id="summit-winners-title">Meet the<br/><em>previous winners.</em></h2></div>
          <p>Explore the published winner lists from earlier editions of Youth Eco Summit.</p>
        </div>
        <div className="summit-winner-layout">
          <div className="summit-winner-photo" data-reveal><Image src="/images/awards.jpg" alt="An award presentation at Youth Eco Summit" fill sizes="(max-width: 760px) 90vw, 44vw" /><span>Recognising ideas.<br/>Celebrating effort.</span></div>
          <SummitCarousel label="Winner lists" className="summit-winner-carousel">
            {winnerDocuments.map(document => <a className="summit-winner-document" href={document.href} target="_blank" rel="noreferrer" key={document.href} draggable={false}><span className="summit-document-mark" aria-hidden="true">PDF<span>→</span></span><div><span className="summit-document-year">{document.year ? `${document.year} EDITION` : 'WINNERS ARCHIVE'}</span><h3>{document.title}</h3><span className="summit-document-action">Open winner list <span className="summit-screenreader">PDF, opens in a new tab</span></span></div><OutwardArrow /></a>)}
          </SummitCarousel>
        </div>
      </div>
    </section>
  );
}

export function SummitGallery() {
  return (
    <div className="summit-gallery" id="summit-in-pictures">
      <SummitCarousel label="Summit photographs" className="summit-gallery-carousel">
        {galleryImages.map((item, index) => <figure className="summit-gallery-image" key={`${item.image}-${index}`}><Image src={item.image} alt={item.alt} fill draggable={false} sizes="(max-width: 600px) 80vw, (max-width: 1000px) 65vw, 50vw" /></figure>)}
      </SummitCarousel>
      <div className="summit-gallery-footer"><p>On stage and in workshops: photographs from previous editions of Youth Eco Summit.</p></div>
    </div>
  );
}

export function PressAndSocial() {
  return (
    <section className="summit-press campaign-container section-space" aria-labelledby="summit-press-title">
      <div className="summit-heading-row" data-reveal><div><SectionEyebrow>Beyond the summit</SectionEyebrow><h2 id="summit-press-title">In the news.<br/><em>In the conversation.</em></h2></div><p>Read the coverage. Follow the stories. See what the Youth Eco Summit community is sharing.</p></div>
      <div className="summit-press-layout">
        <div className="summit-press-list">
          {pressLinks.map(item => <a href={item.href} target="_blank" rel="noreferrer" key={item.href} className="summit-press-link" data-reveal><div><span className="summit-press-outlet">{item.outlet}</span><h3>{item.title}</h3></div><OutwardArrow /><span className="summit-screenreader">Opens in a new tab</span></a>)}
        </div>
        <aside className="summit-social-card" aria-labelledby="summit-social-title" data-reveal><span className="summit-social-word" aria-hidden="true">YES.</span><div><p className="summit-eyebrow">Keep up with the community</p><h3 id="summit-social-title">See it.<br/>Share it.<br/>Be part of it.</h3></div><div className="summit-social-links">{socialLinks.map(item => <a href={item.href} target="_blank" rel="noreferrer" key={item.href}>{item.label}<OutwardArrow /><span className="summit-screenreader">Opens in a new tab</span></a>)}</div></aside>
      </div>
    </section>
  );
}
