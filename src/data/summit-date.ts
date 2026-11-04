/** Calendar date requested on 5 October; an event start time is not yet confirmed. */
export const summitDate = '2027-01-29';
export const summitDateLabel = '29 January 2027';
export const summitTheme = 'Waste segregation, the need of the hour';

export function daysUntilSummit(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: string) => Number(parts.find(value => value.type === type)?.value);
  const today = Date.UTC(part('year'), part('month') - 1, part('day'));
  return Math.round((Date.parse(`${summitDate}T00:00:00Z`) - today) / 86_400_000);
}
