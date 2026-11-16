import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {afterEach,expect,it,vi} from 'vitest';
import {JudgePickerDate} from '../src/components/judge-picker-date';
import {date} from '../src/components/api';
afterEach(()=>vi.unstubAllEnvs());
const render=(submitted_at:unknown,source='wordpress')=>renderToStaticMarkup(createElement(JudgePickerDate,{source,entry:{submitted_at,imported_at:'2026-11-16T11:00:00Z'}}));
it('renders the original WordPress date verbatim and labels its provenance',()=>{
 const html=render('2026-11-13 09:45:00');expect(html).toContain('2026-11-13 09:45:00');expect(html).toContain('WordPress record');expect(html).not.toContain('2026-11-16');
});
it('does not reinterpret naive source timestamps in the browser timezone',()=>{
 vi.stubEnv('TZ','America/Los_Angeles');const west=render('2026-11-15 23:10:00');vi.stubEnv('TZ','Asia/Kolkata');expect(render('2026-11-15 23:10:00')).toBe(west);
 expect(render('2026-11-15T23:10:00+05:30')).toContain('2026-11-15T23:10:00+05:30');
});
it('marks missing and malformed source dates as unrecorded without showing import time',()=>{
 for(const value of [undefined,null,'','  ','0000-00-00 00:00:00','2026-02-30 12:00:00','not-a-date',42,{}]){
  const html=render(value);expect(html).toContain('Original submission date not recorded');expect(html).not.toContain('2026-11-16');
 }
});
it('keeps existing native-date formatting',()=>{
 const value='2026-11-14T06:30:00Z';expect(render(value,'portal')).toContain(date(value));
});
