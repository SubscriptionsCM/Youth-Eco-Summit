import {expect,it} from 'vitest';
import {filterSavedWork,savedWorkTitle} from '../src/domain/saved-work';
const rows=[{id:'1',form_key:'teacher',reference:'YES-TEACHER',status:'submitted'},{id:'2',form_key:'open-letter',reference:'YES-LETTER',status:'draft'},{id:'3',form_key:'unknown-form',reference:'YES-OLD',status:'draft'}];
it('filters saved drafts and receipts without mutating or reordering records',()=>{
 const before=structuredClone(rows);expect(filterSavedWork(rows,'draft','').map(r=>r.id)).toEqual(['2','3']);expect(filterSavedWork(rows,'submitted','').map(r=>r.id)).toEqual(['1']);expect(rows).toEqual(before);
});
it('matches human titles and references without exposing raw answer payloads',()=>{
 expect(filterSavedWork(rows,'all','  yes-letter  ').map(r=>r.id)).toEqual(['2']);expect(filterSavedWork(rows,'all','Educator').map(r=>r.id)).toEqual(['1']);
 expect(filterSavedWork([{...rows[0],answers:{password:'hidden-value'}}],'all','hidden-value')).toEqual([]);
});
it('keeps unknown archived form keys readable instead of crashing the dashboard',()=>{
 expect(savedWorkTitle(rows[2])).toBe('Saved form');expect(filterSavedWork(rows,'all','saved form').map(r=>r.id)).toEqual(['3']);
});
