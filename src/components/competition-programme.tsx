import Image from 'next/image';
import Link from 'next/link';
import { competitionProgramme2027 } from '../data/competition-programme';
import { competitionGuidelines2027, guidelineClassesLabel, guidelineFileLabel, guidelines2027Source, type CompetitionGuideline2027 } from '../data/guidelines-2027';
import { date, type Row } from './api';
import { ParticipationDeadline } from './participation-deadline';
import { competitionAvailability, competitionPath, findProgrammeCompetition } from './competition-public';
import '../app/competition-programme.css';

export function GuidelinesDownload({ className = 'text-link' }: { className?: string }) {
  return <a className={className} href={guidelines2027Source.href} target="_blank" rel="noopener noreferrer">Download 2027 guidelines <span className="sr-only">PDF, opens in a new tab</span><span aria-hidden="true">→</span></a>;
}

export function GuidelinesEssentials() {
  return <section className="guidelines-essentials" aria-labelledby="guidelines-essentials-title"><div><p className="editorial-eyebrow">2027 competition guidelines</p><h2 id="guidelines-essentials-title">Before you create.</h2><p>Choose the topic for your class. Check the participation mode, word count and required files before you start.</p><GuidelinesDownload /></div><div><ul>{guidelines2027Source.generalRules.map(rule => <li key={rule}>{rule}</li>)}</ul><p><strong>Submission title</strong></p><code>{guidelines2027Source.titlePattern}</code><p className="guidelines-example">Example: {guidelines2027Source.titleExample}</p><ParticipationDeadline /></div></section>;
}

export function CompetitionGuidelineDetails({ guideline, showTitle = true }: { guideline: CompetitionGuideline2027; showTitle?: boolean }) {
  return <div className="competition-guideline-details">
    {showTitle && <h3>{guideline.title} guidelines</h3>}
    <p><strong>{guidelineClassesLabel(guideline)}</strong> · {guideline.team.allowed ? `Individual or a group of up to ${guideline.team.maxMembers} students` : 'Individual participation'}</p>
    {guideline.languages.length > 0 && <p>Languages: {guideline.languages.join(' or ')}.</p>}
    {guideline.wordRange && <p>Length: {guideline.wordRange.min}–{guideline.wordRange.max} words.</p>}
    <p>{guideline.entryLimit === null ? 'No entry-count limit is specified in the guidelines.' : `Maximum ${guideline.entryLimit} entries.`}</p>
    <h4>Choose your topic</h4>
    {guideline.classTopics.map((group, index) => <div className="guidelines-topic-group" key={index}>{group.classes.length > 0 && <p className="guidelines-topic-class">Classes {group.classes[0]}–{group.classes[group.classes.length - 1]}</p>}{group.topics.map(topic => <article key={topic.title}><h5>{topic.title}</h5><p>{topic.prompt}</p>{topic.references && <div className="guidelines-reading"><strong>Suggested reading</strong><ul>{topic.references.map(reference => <li key={reference.url}><a href={reference.url} target="_blank" rel="noopener noreferrer">{reference.title}<span className="sr-only">, opens in a new tab</span></a></li>)}</ul></div>}</article>)}</div>)}
    <h4>Prepare your files</h4><ul>{guideline.fileRequirements.map(file => <li key={file.role}><strong>{file.title}</strong>: {guidelineFileLabel(file)}{file.orientation && ` · ${file.orientation === 'landscape' ? 'landscape' : 'landscape or portrait'}`}{file.maxHeight && ` · up to ${file.maxHeight}p`}{file.captionsRequired && ' · closed captions required'}</li>)}</ul>
    <ul>{guideline.notes.map(note => <li key={note}>{note}</li>)}</ul>
    <details className="guidelines-scoring"><summary>How your work will be evaluated</summary><div className="guidelines-table-wrap"><table><caption>Published judging criteria · {guideline.rubric.total} marks</caption><thead><tr><th scope="col">Criterion</th><th scope="col">Marks</th></tr></thead><tbody>{guideline.rubric.criteria.map(criterion => <tr key={criterion.title}><td>{criterion.title}</td><td>{criterion.marks}</td></tr>)}{guideline.rubric.penalties.map(penalty => <tr key={penalty.title}><td>{penalty.title}</td><td>{penalty.marks}</td></tr>)}</tbody></table></div>{guideline.rubric.notes.map(note => <p key={note} className="guidelines-score-note">{note}</p>)}</details>
    <h4>Recognition opportunities</h4><ul>{guideline.rewards.map(reward => <li key={reward}>{reward}</li>)}</ul><p>Selection, publication and showcase opportunities are subject to the arrangements described in the guidelines.</p>
  </div>;
}

export function GuidelinesRecognition() {
  return <section className="editorial-section editorial-container guidelines-recognition"><div className="editorial-section-heading"><p className="editorial-eyebrow">From the 2027 guidelines</p><h2>Where your work could go.</h2><p>Different formats offer different recognition opportunities. Selection and partner arrangements determine what is available.</p><GuidelinesDownload /></div><div className="guidelines-recognition-grid">{competitionGuidelines2027.filter(item => !['blog-writing', 'article-writing', 'case-study', 'digital-art'].includes(item.slug)).map(item => <article key={item.slug}><h3>{item.category === 'Writing' ? 'Written work' : item.title}</h3><ul>{item.rewards.map(reward => <li key={reward}>{reward}</li>)}</ul><Link className="text-link" href={`/competitions#guidelines-${item.slug}`}>View the guidelines <span aria-hidden="true">→</span></Link></article>)}</div></section>;
}

export function CompetitionProgramme({ competitions = [], editions = [] }: { competitions?: Row[]; editions?: Row[] }) {
  return <div className="competition-programme">
    <div className="competition-programme-grid">{competitionProgramme2027.map((item, index) => {
      const published = findProgrammeCompetition(competitions, editions, item.slug);
      return <article className="competition-programme-card" id={`guidelines-${item.slug}`} key={item.slug}>
        <div className="competition-programme-photo">{item.image ? <Image src={`/images/summit/${item.image}`} alt={item.alt} fill unoptimized sizes="(max-width: 600px) 90vw, (max-width: 1100px) 45vw, 30vw" style={{ objectPosition: item.position }} /> : <div className={`competition-format-art competition-format-art--${item.slug}`} aria-hidden="true"><b>{item.slug === 'short-film-making' ? 'REC' : item.slug === 'blog-writing' ? 'POST' : item.slug === 'digital-art' ? 'ART' : 'Aa'}</b><span>{item.format}</span></div>}<span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span></div>
        <div className="competition-programme-copy"><p>{item.format}</p><h3>{item.title}</h3><p className="competition-programme-description">{item.description}</p><p className="competition-programme-eligibility">{guidelineClassesLabel(item)} · {item.team.allowed ? `Solo or up to ${item.team.maxMembers} students` : 'Individual'}</p>
          <details className="competition-programme-rules"><summary>Topics & submission guidelines <span aria-hidden="true">+</span></summary><CompetitionGuidelineDetails guideline={item} showTitle={false} /></details>
          {published && !item.eligibilityPending && <div className="competition-programme-entry"><p>{competitionAvailability(published, editions).label} · Closes: {date(published.closes_at || published.closesAt)}</p><Link className="text-link" href={competitionPath(published)}>Entry information <span aria-hidden="true">→</span></Link></div>}
        </div>
      </article>;
    })}</div>
    <div className="competition-programme-footer"><p>Photographs from previous summits.</p><GuidelinesDownload /><a className="text-link" href="/documents/winners/Final-Winner-sheet2026.pdf" target="_blank" rel="noopener noreferrer">View the 2026 results <span className="sr-only">PDF, opens in a new tab</span><span aria-hidden="true">→</span></a></div>
  </div>;
}
