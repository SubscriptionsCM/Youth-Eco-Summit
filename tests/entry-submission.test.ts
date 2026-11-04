import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/components/api';
import { submitSavedEntry } from '../src/components/entry-submission';

describe('entry confirmation after a lost response',()=>{
 it('retries confirmation at the saved version without rewriting a potentially committed entry',async()=>{
  const pending={current:null as number|null},save=vi.fn(async()=>7);
  const receipt={id:'entry',reference:'YES-reference',state:'submitted'};
  const confirm=vi.fn().mockRejectedValueOnce(new TypeError('Connection lost after commit')).mockResolvedValueOnce(receipt);
  await expect(submitSavedEntry(pending,save,confirm)).rejects.toThrow('Connection lost');
  expect(pending.current).toBe(7);
  expect(await submitSavedEntry(pending,save,confirm)).toEqual(receipt);
  expect(save).toHaveBeenCalledTimes(1);expect(confirm.mock.calls).toEqual([[7],[7]]);expect(pending.current).toBeNull();
 });
 it('retains the pending version for a server failure but permits correction after a definite validation response',async()=>{
  const pending={current:null as number|null},save=vi.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(4);
  const confirm=vi.fn().mockRejectedValueOnce(new ApiError('Server failure',undefined,503)).mockRejectedValueOnce(new ApiError('Required file missing',undefined,422)).mockResolvedValueOnce({state:'submitted'});
  await expect(submitSavedEntry(pending,save,confirm)).rejects.toThrow('Server failure');expect(pending.current).toBe(3);
  await expect(submitSavedEntry(pending,save,confirm)).rejects.toThrow('Required file');expect(pending.current).toBeNull();expect(save).toHaveBeenCalledTimes(1);
  await submitSavedEntry(pending,save,confirm);expect(save).toHaveBeenCalledTimes(2);expect(confirm.mock.calls).toEqual([[3],[3],[4]]);
 });
 it('does not confirm when saving fails or returns an unconfirmed version',async()=>{
  const pending={current:null as number|null},confirm=vi.fn();
  await expect(submitSavedEntry(pending,async()=>{throw new Error('Save failed');},confirm)).rejects.toThrow('Save failed');
  await expect(submitSavedEntry(pending,async()=>undefined,confirm)).rejects.toThrow('saved entry version');
  expect(confirm).not.toHaveBeenCalled();expect(pending.current).toBeNull();
 });
});
