/** Build-time mode mirrors the source site's manual administration workflow. */
export function manualReviewMode(){return process.env.NEXT_PUBLIC_JUDGING_MODE==='manual';}
export const assignedReviewSections=new Set(['judges','assignments','rules','rounds','reviews','results']);
