import { ApiError } from './api';

export type PendingEntrySubmission = { current: number | null };
/** Keep the saved version until confirmation has a definite outcome. A retry must never PUT first. */
export async function submitSavedEntry<T>(pending: PendingEntrySubmission, save: () => Promise<number | undefined>, confirm: (version: number) => Promise<T>): Promise<T> {
  if (pending.current === null) {
    const version = await save();
    if (!Number.isInteger(version) || version! < 0) throw new Error('The saved entry version could not be confirmed. Refresh the entry before submitting.');
    pending.current = version!;
  }
  try {
    const receipt = await confirm(pending.current);
    pending.current = null;
    return receipt;
  } catch (error) {
    if (error instanceof ApiError && error.status !== undefined && error.status >= 400 && error.status < 500) pending.current = null;
    throw error;
  }
}
