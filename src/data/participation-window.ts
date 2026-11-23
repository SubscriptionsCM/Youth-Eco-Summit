/** Safe default until an administrator saves a deadline; separate from the summit event date. */
export const participationWindow = {
  opensAt: '2026-09-30T18:30:00.000Z',
  closesAt: '2026-11-30T18:30:00.000Z',
  dateLabel: '30 November 2026',
  deadlineLabel: '30 November 2026, 11:59 p.m. IST',
  timezone: 'Asia/Kolkata',
  scope: 'student-registration-and-competition-submissions',
} as const;

export type ParticipationWindowStatus = {
  state: 'upcoming' | 'open' | 'closed'; label: string; detail: string; isOpen: boolean;
};
export type ParticipationTiming = Pick<{[K in keyof typeof participationWindow]: string}, 'opensAt'|'closesAt'|'dateLabel'|'deadlineLabel'>;
export type ParticipationWindow = ParticipationTiming & {timezone:string;scope:string};

/** The selected date includes its entire day in India (UTC+05:30). */
export function windowForDeadline(deadlineDate: string): ParticipationWindow {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(deadlineDate)) throw new Error('Choose a valid deadline date.');
  const day=new Date(`${deadlineDate}T00:00:00.000Z`);
  if(!Number.isFinite(day.getTime())||day.toISOString().slice(0,10)!==deadlineDate) throw new Error('Choose a valid calendar date.');
  const closesAt=new Date(`${deadlineDate}T18:30:00.000Z`).toISOString();
  if(closesAt<=participationWindow.opensAt) throw new Error('The deadline must be on or after 1 October 2026.');
  const dateLabel=new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(day);
  return {...participationWindow,closesAt,dateLabel,deadlineLabel:`${dateLabel}, 11:59 p.m. IST`};
}

export function participationWindowStatus(now: number | Date = Date.now(), window: ParticipationTiming = participationWindow): ParticipationWindowStatus {
  const timestamp = now instanceof Date ? now.getTime() : now;
  if (timestamp < Date.parse(window.opensAt)) return { state: 'upcoming', label: 'Student registration & competition submissions open 1 October 2026', detail: `Deadline: ${window.deadlineLabel}.`, isOpen: false };
  if (timestamp >= Date.parse(window.closesAt)) return { state: 'closed', label: 'Student registration & competition submissions closed', detail: `The deadline was ${window.deadlineLabel}.`, isOpen: false };
  return { state: 'open', label: 'Student registration & competition submissions open', detail: `Submit by ${window.deadlineLabel}.`, isOpen: true };
}
