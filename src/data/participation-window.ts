/** Student-registration and competition-submission dates confirmed by the user on 6 October 2026; separate from the summit event date. */
export const participationWindow = {
  opensAt: '2026-09-30T18:30:00.000Z',
  closesAt: '2026-11-05T18:30:00.000Z',
  dateLabel: '5 November 2026',
  deadlineLabel: '5 November 2026, 11:59 p.m. IST',
  timezone: 'Asia/Kolkata',
  scope: 'student-registration-and-competition-submissions',
} as const;

export type ParticipationWindowStatus = {
  state: 'upcoming' | 'open' | 'closed'; label: string; detail: string; isOpen: boolean;
};

export function participationWindowStatus(now: number | Date = Date.now()): ParticipationWindowStatus {
  const timestamp = now instanceof Date ? now.getTime() : now;
  if (timestamp < Date.parse(participationWindow.opensAt)) return { state: 'upcoming', label: 'Student registration & competition submissions open 1 October 2026', detail: `Deadline: ${participationWindow.deadlineLabel}.`, isOpen: false };
  if (timestamp >= Date.parse(participationWindow.closesAt)) return { state: 'closed', label: 'Student registration & competition submissions closed', detail: `The deadline was ${participationWindow.deadlineLabel}.`, isOpen: false };
  return { state: 'open', label: 'Student registration & competition submissions open', detail: `Submit by ${participationWindow.deadlineLabel}.`, isOpen: true };
}
