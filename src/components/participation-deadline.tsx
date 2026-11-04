'use client';

import { useEffect, useState } from 'react';
import { participationWindow, participationWindowStatus, type ParticipationWindowStatus } from '../data/participation-window';
import '../app/participation-deadline.css';

/** Neutral server markup prevents stale static previews from claiming entries remain open. */
export function ParticipationDeadline({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  const [status, setStatus] = useState<ParticipationWindowStatus | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    function refresh() {
      const now = Date.now();
      const current = participationWindowStatus(now);
      setStatus(current);
      const boundary = current.state === 'upcoming' ? Date.parse(participationWindow.opensAt) : current.state === 'open' ? Date.parse(participationWindow.closesAt) : null;
      if (boundary !== null) timer = setTimeout(refresh, Math.min(Math.max(boundary - now + 1, 1), 2_147_483_000));
    }
    refresh();
    return () => { if (timer !== undefined) clearTimeout(timer); };
  }, []);
  const detail = compact && status ? `${status.state === 'closed' ? 'Deadline' : 'Closes'}: ${participationWindow.dateLabel} (IST).` : status?.detail;
  return <p className={`participation-deadline${compact ? ' participation-deadline--compact' : ''} ${className}`.trim()} data-window-state={status?.state || 'scheduled'}>{status ? <><strong>{status.label}.</strong>{' '}<span>{detail}</span></> : <><strong>Student registration & competition deadline:</strong>{' '}<span>{participationWindow.deadlineLabel}.</span></>}</p>;
}
