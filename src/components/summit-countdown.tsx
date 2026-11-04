'use client';
import { useEffect, useState } from 'react';
import { daysUntilSummit, summitDate, summitDateLabel } from '@/data/summit-date';

export function SummitCountdown() {
  const [days, setDays] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setDays(daysUntilSummit(new Date()));
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return <div className="summit-countdown" aria-label={`Countdown to ${summitDateLabel}`}>
    <div className="countdown-number">{days === null ? <span aria-hidden="true">—</span> : days > 0 ? <><strong>{days}</strong><span>days to go</span></> : <strong className="countdown-status">{days === 0 ? 'Today' : '2027 edition'}</strong>}</div>
    <div><span>Youth Eco Summit</span><time dateTime={summitDate}>{summitDateLabel}</time></div>
  </div>;
}
