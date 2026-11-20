import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {it,expect} from 'vitest';
import {JudgePickerDate} from '../src/components/judge-picker-date';
it('presents a consistent calendar format without changing original source timestamps',()=>{
 const original='2026-11-15 08:00:01';
 const source=renderToStaticMarkup(createElement(JudgePickerDate,{source:'wordpress',entry:{submitted_at:original}}));
 const native=renderToStaticMarkup(createElement(JudgePickerDate,{source:'portal',entry:{submitted_at:'2026-11-15T02:30:01Z'}}));
 expect(source).toContain('15 Nov 2026, 08:00:01');expect(native).toContain('15 Nov 2026, 08:00:01');
 expect(source).toContain('dateTime="2026-11-15T08:00:01"');expect(source).not.toContain('WordPress');
});
it('never substitutes capture or import time for a missing or invalid original date',()=>{
 const missing=renderToStaticMarkup(createElement(JudgePickerDate,{source:'wordpress',entry:{submitted_at:'2026-02-31 08:00:00',imported_at:'2026-11-20T00:00:00Z'}}));
 expect(missing).toContain('Original submission date not recorded');expect(missing).not.toContain('20 Nov');
});
