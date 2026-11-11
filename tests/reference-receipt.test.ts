import {describe,expect,it,vi} from 'vitest';
import {loadSubmittedRecord} from '../src/components/reference-receipt';
const previous={id:'record-id',reference:'QA-REFERENCE',answers:{name:'Previous step value'},status:'draft'};
const receipt={reference:'QA-REFERENCE',status:'submitted'};
describe('canonical submitted receipt',()=>{
 it('shows normalized persisted answers and the immutable snapshot after final-step edits',async()=>{
  const canonical={...previous,status:'submitted',answers:{name:'Final edited value'},receipt,form_snapshot:{fields:[]}};const read=vi.fn().mockResolvedValue(canonical);
  expect(await loadSubmittedRecord(previous,receipt,read)).toEqual(canonical);expect(read).toHaveBeenCalledOnce();
 });
 it('retains success but omits stale answers when the follow-up read is unavailable',async()=>{
  const result=await loadSubmittedRecord(previous,receipt,async()=>{throw new Error('Temporary read failure');});
  expect(result).toMatchObject({id:previous.id,status:'submitted',receipt,details_pending:true});expect(result).not.toHaveProperty('answers');
 });
});
