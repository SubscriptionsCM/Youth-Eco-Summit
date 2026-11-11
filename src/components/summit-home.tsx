import Image from 'next/image';
import Link from 'next/link';
import { SummitCarousel } from './summit-carousel';
import { CampaignMotion } from './campaign-motion';
import { ParticipationSteps } from './home-interactions';
import { GetInvolved } from './get-involved';
import { SummitCountdown } from './summit-countdown';
import { ParticipationDeadline } from './participation-deadline';
import { participationWindow } from '../data/participation-window';
import { summitTheme } from '@/data/summit-date';
import '@/app/meeting-update.css';
import { AnimatedFAQ } from './animated-faq';
import { GuidelinesDownload } from './competition-programme';
import { PartnerStrip, SummitExpectations, SummitSpeakers, PreviousWinners, SummitGallery, PressAndSocial } from './summit-sections';

function Arrow() { return <span aria-hidden="true">→</span>; }
function SectionLabel({ children, light = false }: { children: React.ReactNode; light?: boolean }) { return <p className={`section-label${light ? ' light' : ''}`}><span aria-hidden="true" />{children}</p>; }
export function SummitHome() {
return <CampaignMotion><div className="campaign-home">
  <section className="home-hero" aria-labelledby="hero-title">
    <div className="campaign-container hero-layout">
      <div className="hero-editorial">
        <div data-hero-copy><SectionLabel>Asia’s largest youth-led platform</SectionLabel></div>
        <h1 id="hero-title" data-hero-copy>Your ideas.<br/><span>Bigger<br className="desktop-break"/> stage.</span></h1>
        <p className="hero-theme" data-hero-copy><span>2027 theme</span>{summitTheme}</p>
        <div className="hero-actions" data-hero-copy><Link className="yes-button" href="#get-involved">Get involved</Link><Link className="text-link" href="/competitions">Explore competitions</Link></div>
        <ParticipationDeadline compact/>
        <SummitCountdown/>
        <Link className="hero-school-link" href="/schools" data-hero-copy><span>Find your school</span></Link>
      </div>
      <div className="hero-composition" data-layer-scene data-enter-media><div className="hero-orbit" data-layer="-34" aria-hidden="true"/><div className="hero-yellow-disc" data-layer="-22" aria-hidden="true"/><div className="hero-back-type" aria-hidden="true" data-layer="-15">YES.</div><div className="hero-photo-clip" data-layer="12"><Image src="/images/hero-cutout.webp" width={1374} height={1145} alt="Young participants at Youth Eco Summit" sizes="(max-width: 760px) 100vw, 58vw" priority unoptimized /></div><a className="hero-stage-card" href="#summit-expectations" data-layer="-8"><Image src="/images/summit/gallery-_mai0896.jpg" width={1024} height={683} alt="A student speaking into a microphone on the summit stage" sizes="(max-width:600px) 145px, 200px"/><span>Young voices. On stage.</span></a><span className="hero-caption">THE NEXT GENERATION. IN THEIR OWN WORDS.</span></div>
    </div>
    <div className="hero-manifesto"><div className="campaign-container"><span>Learn.</span><i aria-hidden="true">✳</i><span>Create.</span><i aria-hidden="true">✳</i><span>Compete.</span><i aria-hidden="true">✳</i><span>Lead.</span></div></div>
  </section>

  <PartnerStrip/>
  <GetInvolved/>

  <section className="home-about campaign-container section-space" id="about" aria-labelledby="about-heading"><div className="section-heading" data-reveal><SectionLabel>The summit</SectionLabel><h2 id="about-heading">Learning meets<br/><em>real action.</em></h2><p>Students do more than learn about the environment. They question, create, compete and share what matters to them.</p><Link className="text-link" href="/about">Discover the summit <Arrow/></Link></div><SummitCarousel label="Learning at the summit" className="learning-grid learning-grid-visual home-learning-carousel">{[['01','Learn','Understand real environmental issues.','workshop.jpg'],['02','Engage','Ask. Discuss. Be heard.','students.jpg'],['03','Create','Turn ideas into expression.','school.jpg'],['04','Get recognised','Let good work stand out.','awards.jpg']].map(([n,t,p,photo],i)=><article key={n}><div className="learning-photo"><Image src={`/images/${photo}`} alt="" fill sizes="(max-width:600px) 45vw, 22vw"/></div><div className="learning-caption"><span>{n}</span><h3>{t}</h3><p>{p}</p></div></article>)}</SummitCarousel></section>





  <section className="home-competitions campaign-container section-space" aria-labelledby="competitions-title"><div className="section-row" data-reveal><div><SectionLabel>Find your format</SectionLabel><h2 id="competitions-title">Create. Compete.<br/><em>Be seen.</em></h2></div><div><p>Ten 2027 competition formats for Classes 5–12.<br/>Choose your class topic and make it your own.</p><Link href="/competitions" className="text-link">View competitions <Arrow/></Link></div></div><div className="competition-award-note" data-reveal><strong>15</strong><span>awards celebrating<br/>student ideas & creativity</span><Link href="/awards">Explore recognition <Arrow/></Link></div><SummitCarousel label="Competition formats" className="home-format-carousel"><Link className="format-card format-writing" href="/competitions"><span className="format-kicker">PUT IT INTO WORDS</span><h3>Writing<br/>& stories</h3><span className="type-art" aria-hidden="true">Aa<span>“</span></span><span className="format-bottom">Bring your perspective <b aria-hidden="true">→</b></span></Link><Link className="format-card format-art" href="/competitions" data-layer-scene><span className="format-kicker">MAKE IDEAS VISIBLE</span><h3>Art &<br/>expression</h3><div className="format-art-disc" data-layer="-14" aria-hidden="true"/><Image data-layer="12" src="/images/creative-cutout.webp" alt="A young artist creating at the summit" width={1536} height={1024} sizes="(max-width:760px) 90vw, 23vw"/><span className="format-bottom">Show us your world <b aria-hidden="true">→</b></span></Link><Link className="format-card format-film" href="/competitions"><span className="film-type-art" aria-hidden="true">PLAY<br/>YOUR<br/>PART.</span><span className="format-kicker">A FRESH PERSPECTIVE</span><h3>Film &<br/>storytelling</h3><span className="format-bottom">Tell a different story <b aria-hidden="true">→</b></span></Link><Link className="format-card format-ideas" href="/competitions"><span className="format-kicker">ASK. EXPLORE. BUILD.</span><h3>Ideas &<br/>innovation</h3><div className="ideas-art" aria-hidden="true"><span>?</span><span>!</span></div><span className="format-bottom">Think beyond the obvious <b aria-hidden="true">→</b></span></Link></SummitCarousel><p className="competition-footnote">Open letters, blogs, articles, case studies, film, monologue, painting, digital art, craft and eco-business ideas. Read the 2027 guidelines for your class. Student registrations and competition submissions close on {participationWindow.deadlineLabel}.</p><GuidelinesDownload /></section>

  <section className="home-how" id="how-it-works" aria-labelledby="how-title"><div className="campaign-container section-space"><div className="section-row" data-reveal><div><SectionLabel>How it works</SectionLabel><h2 id="how-title">Start here.<br/><em>Go further.</em></h2></div><div><p>A simple path from interest to participation.</p><Link href="/how-to-participate" className="text-link">Read the participation guide <Arrow/></Link></div></div><ParticipationSteps/></div></section>

  <section className="home-faq campaign-container" aria-labelledby="faq-title"><div><SectionLabel>Before you begin</SectionLabel><h2 id="faq-title">A few things<br/>to <em>know.</em></h2><Link href="/faq" className="text-link">All FAQs <Arrow/></Link></div><div className="faq-questions"><AnimatedFAQ question="Does my school need to register every year?"><p>No. School registration is lifetime. Returning schools use their permanent school ID and confirm or update their details.</p></AnimatedFAQ><AnimatedFAQ question="Do I need a school ID to take part?"><p>Yes. Student registration requires a registered, active school. <Link href="/schools">Find your school</Link> or nominate it if it is not listed.</p></AnimatedFAQ><AnimatedFAQ question="What do I need for student registration?"><p>Keep your school ID and parent or guardian contact ready. Follow the sign-in verification and consent steps, then complete your student profile.</p></AnimatedFAQ><AnimatedFAQ question="When do student registration and entries close?"><ParticipationDeadline /></AnimatedFAQ><AnimatedFAQ question="Can I save my work and come back?"><p>Sign in to save and return to your registration or competition draft. Complete each step, save your progress and review everything before final submission.</p></AnimatedFAQ><AnimatedFAQ question="Can I use AI in my entry?"><p>AI may be used for research or reference. AI-generated content in your submission receives a 15-point deduction. Keep your ideas personal and credit sources you use or are inspired by.</p></AnimatedFAQ><AnimatedFAQ question="Does entering a competition include summit attendance?"><p>Competition registration and event attendance are separate. Check the summit participation details for attendance information.</p></AnimatedFAQ></div></section>

  <SummitExpectations/>
  <SummitSpeakers/>



  <PreviousWinners/>

  <section className="home-work campaign-container section-space" aria-labelledby="work-title"><div className="section-row" data-reveal><div><SectionLabel>Student work</SectionLabel><h2 id="work-title">Made by<br/><em>young minds.</em></h2></div><div><p>See what students can create when they are given a platform. Discover winning entries and ideas beyond the awards, shared with permission from young environmental thinkers.</p><Link href="/showcase" className="text-link">Explore student work <Arrow/></Link></div></div><SummitGallery/></section>



  <PressAndSocial/>

  <section className="home-final" aria-labelledby="final-title"><div className="campaign-container"><SectionLabel light>Your next step</SectionLabel><h2 id="final-title" data-reveal>Be part of<br/><em>the summit.</em><span aria-hidden="true">→</span></h2><div className="final-bottom"><p>One idea can be your beginning.<br/>Join Youth Eco Summit and give it somewhere to go.</p><div><Link className="yes-button yellow" href="/get-involved">Get involved <Arrow/></Link><Link className="yes-button light-outline" href="/schools/register">Register your school <Arrow/></Link></div></div></div></section>
</div></CampaignMotion>;
}
