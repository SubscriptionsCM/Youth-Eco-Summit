import {expect,it} from 'vitest';
import {activityTitle,recordTypeTitle} from '../src/domain/portal-language';
it('names school and QC actions so staff can recognize them in the activity log',()=>{
 expect(activityTitle('school.access.approved')).toBe('School access approved');
 expect(activityTitle('school.access.revoked')).toBe('School access removed');
 expect(activityTitle('school.student.correct')).toBe('School student details corrected');
 expect(activityTitle('submission.quality.update')).toBe('Quality check updated');
 expect(recordTypeTitle('submission_quality')).toBe('Submission quality checks');
});
