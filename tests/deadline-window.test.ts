import { expect, it } from 'vitest';
import { participationWindowStatus } from '../src/data/participation-window';
it('uses a saved override through the final millisecond of the selected day in India',()=>{
 const window={opensAt:'2026-09-30T18:30:00.000Z',closesAt:'2026-12-03T18:30:00.000Z',dateLabel:'3 December 2026',deadlineLabel:'3 December 2026, 11:59 p.m. IST'};
 expect(participationWindowStatus(new Date('2026-12-03T18:29:59.999Z'),window).isOpen).toBe(true);
 expect(participationWindowStatus(new Date('2026-12-03T18:30:00.000Z'),window).state).toBe('closed');
});
