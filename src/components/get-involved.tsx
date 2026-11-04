import { SummitCarousel } from './summit-carousel';
import Image from 'next/image';
import Link from 'next/link';
import '@/app/meeting-update.css';

const audiences = [
  { title: 'Students', image: 'students.jpg', text: 'Find your school, create your profile and choose a competition.', label: 'Find your school', href: '/schools', secondary: 'Have a school ID? Register', secondaryHref: '/register' },
  { title: 'Educators & schools', image: 'workshop.jpg', text: 'Create a teacher profile linked to your school. Share the school ID and support original student work.', label: 'Register as a teacher', href: '/teachers/register', secondary: 'New school? Register once', secondaryHref: '/schools/register' },
  { title: 'Partner organizations', image: 'school.jpg', text: 'Support student learning, creative experiences and environmental action.', label: 'Enquire about a partnership', href: '/partners/enquire', secondary: 'Explore partnerships', secondaryHref: '/partners' },
];

export function GetInvolved({ standalone = false }: { standalone?: boolean }) {
  const Heading = standalone ? 'h1' : 'h2';
  return <section className={`get-involved-section${standalone ? ' get-involved-page' : ''}`} id="get-involved" aria-labelledby="get-involved-title">
    <div className="campaign-container">
      <div className="get-involved-heading" data-reveal><div><p className="section-label">Your next step</p><Heading id="get-involved-title">Get involved.</Heading></div><p>Choose how you want to take part.</p></div>
      <SummitCarousel label="Ways to get involved" className="audience-options">{audiences.map((item, index) => <article className="audience-option" key={item.title}>
        <div className="audience-photo"><Image src={`/images/${item.image}`} alt="" fill sizes="(max-width:600px) 80vw, 30vw"/><span aria-hidden="true">0{index + 1}</span></div>
        <div className="audience-option-copy"><h3>{item.title}</h3><p>{item.text}</p><Link className="text-link" href={item.href}>{item.label}<span aria-hidden="true">→</span></Link><Link className="audience-secondary" href={item.secondaryHref}>{item.secondary}</Link></div>
      </article>)}</SummitCarousel>
      <p className="audience-note">School registration is lifetime. Competition entry and summit attendance are separate.</p>
    </div>
  </section>;
}
