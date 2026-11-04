'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ParticipationArt, type ParticipationIllustration } from './participation-art';
const stepImages: ParticipationIllustration[] = ['find-school', 'register', 'choose-challenge', 'submit-work', 'explore-summit'];
const steps = [
  { title: 'Find your school', text: 'Check whether your school is registered.', detail: 'Already registered? Use your permanent school ID. If your school is missing, nominate it for review.', link: '/schools', cta: 'Find your school' },
  { title: 'Register', text: 'Create your student profile.', detail: 'You’ll need a registered school and a verified parent or guardian contact. School registration lasts across editions.', link: '/register', cta: 'Student registration' },
  { title: 'Pick your challenge', text: 'Choose the competition that fits you.', detail: 'Read the published theme, class eligibility and submission guidelines before you begin.', link: '/competitions', cta: 'Explore competitions' },
  { title: 'Submit your work', text: 'Follow the guidelines and send it in.', detail: 'Save your draft, upload your work and review the details. Keep your receipt after a successful submission.', link: '/dashboard', cta: 'Go to your dashboard' },
  { title: 'Explore the summit', text: 'Learn, connect and celebrate.', detail: 'Explore the summit experience. Event attendance is a separate flow from registration and competition entry.', link: '/experience', cta: 'Explore the experience' },
];
export function ParticipationSteps() {
  const [active, setActive] = useState(0);
  return <div className="participation-interactive"><div className="participation-tabs" role="tablist" aria-label="Participation steps">{steps.map((step, i) => <button key={step.title} id={`step-tab-${i}`} role="tab" aria-selected={i === active} aria-controls="step-panel" tabIndex={i === active ? 0 : -1} onClick={() => setActive(i)} onKeyDown={e => { const next = e.key === 'ArrowRight' ? (active + 1) % 5 : e.key === 'ArrowLeft' ? (active + 4) % 5 : e.key === 'Home' ? 0 : e.key === 'End' ? 4 : -1; if (next !== -1) { e.preventDefault(); setActive(next); document.getElementById(`step-tab-${next}`)?.focus(); } }}><span className="step-number">0{i + 1}</span><span className="step-art"><ParticipationArt name={stepImages[i]} sizes="(max-width: 600px) 165px, (max-width: 820px) 190px, 230px" /></span><strong>{step.title}</strong><span>{step.text}</span></button>)}</div><div className="participation-panel" id="step-panel" role="tabpanel" aria-labelledby={`step-tab-${active}`} tabIndex={0}><p key={active} className="participation-detail">{steps[active].detail}</p><Link className="text-link" href={steps[active].link}>{steps[active].cta} <span aria-hidden="true">→</span></Link></div></div>;
}
