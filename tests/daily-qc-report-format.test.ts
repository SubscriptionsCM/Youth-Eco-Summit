import {describe, expect, it} from 'vitest';
import {formatDailyQCCsv, formatDailyQCText, type DailyQCReport} from '../src/domain/daily-qc-report';

const keys = ['open-letter', 'blog-writing', 'article-writing', 'case-study', 'short-film-making', 'spoken-word', 'painting', 'digital-art', 'waste-to-art', 'eco-business-model'];
function fixture(): DailyQCReport {
 return {
  date: '2026-11-17',
  summary: {totalRegistrations: 23, submissions: 41, qcCompleted: 19, qcCompletedToday: 7, qcRemaining: 22},
  categories: keys.map(formKey => ({formKey, title: 'Internal title', coordinator: 'Test Coordinator', submissions: 4, today: 1, completed: 2, remaining: 2})).reverse(),
 };
}

describe('daily QC report export format', () => {
 it('matches the supplied complete layout with live values and canonical category order', () => {
  expect(formatDailyQCText(fixture())).toBe(`Youth Eco Summit – Daily Submission & QC Summary
Date: 17th November

Overall Summary

• Total Registrations: 23
• Total Submissions Received Till Date: 41
• Total QCs Completed Till Date: 19
• Total QCs Completed Today: 7
• Pending QCs: 22

Category-wise QC Update

1. Open Letter
• Designated Person: Test Coordinator
• Total Submissions: 4
• Total QC Done Today: 1
• Total QCs Completed Till Date: 2
• Pending QC: 2

2. Blog
• Designated Person: Test Coordinator
• Total Submissions: 4
• Total QC Done Today: 1
• Total QCs Completed Till Date: 2
• Pending QC: 2

3. Article
• Designated Person: Test Coordinator
• Total Submissions: 4
• Total QC Done Today: 1
• Total QCs Completed Till Date: 2
• Pending QC: 2

4. Case Study
• Designated Person: Test Coordinator
• Total Submissions: 4
• Total QC Done Today: 1
• Total QCs Completed Till Date: 2
• Pending QC: 2

5. Short Film
• Designated Person: Test Coordinator
• Total Submissions: 4
• Total QC Done Today: 1
• Total QCs Completed Till Date: 2
• Pending QC: 2

6. Spoken Word Monologue
• Designated Person: Test Coordinator
• Total Submissions: 4
• Total QC Done Today: 1
• Total QCs Completed Till Date: 2
• Pending QC: 2

7. Painting
• Designated Person: Test Coordinator
• Total Submissions: 4
• Total QC Done Today: 1
• Total QCs Completed Till Date: 2
• Pending QC: 2

8. Digital Art
• Designated Person: Test Coordinator
• Total Submissions: 4
• Total QC Done Today: 1
• Total QCs Completed Till Date: 2
• Pending QC: 2

9. Waste to Art
• Designated Person: Test Coordinator
• Total Submissions: 4
• Total QC Done Today: 1
• Total QCs Completed Till Date: 2
• Pending QC: 2

10. Eco Business Model
• Designated Person: Test Coordinator
• Total Submissions: 4
• Total QC Done Today: 1
• Total QCs Completed Till Date: 2
• Pending QC: 2
`);
 });

 it.each([
  ['2026-01-01', '1st January'], ['2026-02-02', '2nd February'], ['2026-03-03', '3rd March'],
  ['2026-04-04', '4th April'], ['2026-05-11', '11th May'], ['2026-06-12', '12th June'],
  ['2026-07-13', '13th July'], ['2026-08-21', '21st August'], ['2026-09-22', '22nd September'],
  ['2026-10-23', '23rd October'], ['2026-11-30', '30th November'], ['2026-12-31', '31st December'],
  ['2028-02-29', '29th February'],
 ])('formats report date %s without timezone drift', (date, expected) => {
  expect(formatDailyQCText({...fixture(), date}).split('\n')[1]).toBe(`Date: ${expected}`);
 });

 it('keeps names on one line and marks blank coordinators unassigned', () => {
  const report = fixture();
  report.categories.find(c => c.formKey === 'open-letter')!.coordinator = '  Test\r\nCoordinator\nSecond  ';
  report.categories.find(c => c.formKey === 'blog-writing')!.coordinator = ' \r\n ';
  const text = formatDailyQCText(report);
  expect(text).toContain('• Designated Person: Test Coordinator Second\n');
  expect(text).toContain('2. Blog\n• Designated Person: Not assigned\n');
 });

 it('exports date, overall input totals and six category columns in canonical order', () => {
  const report = fixture();
  const csv = formatDailyQCCsv(report).replace(/^\uFEFF/, '');
  expect(csv.split(/\r?\n/).slice(0, 11)).toEqual([
   '"Youth Eco Summit – Daily Submission & QC Summary"',
   '"Date","2026-11-17"', '', '"Overall Summary"',
   '"Total Registrations","23"',
   '"Total Submissions Received Till Date","41"',
   '"Total QCs Completed Till Date","19"',
   '"Total QCs Completed Today","7"',
   '"Pending QCs","22"', '', '"Category-wise QC Update"',
  ]);
  expect(csv).toContain('"Category","Designated Person","Total Submissions","Total QC Done Today","Total QCs Completed Till Date","Pending QC"');
  expect(csv.split(/\r?\n/).slice(12, 22)).toEqual([
   '"Open Letter","Test Coordinator","4","1","2","2"',
   '"Blog","Test Coordinator","4","1","2","2"',
   '"Article","Test Coordinator","4","1","2","2"',
   '"Case Study","Test Coordinator","4","1","2","2"',
   '"Short Film","Test Coordinator","4","1","2","2"',
   '"Spoken Word Monologue","Test Coordinator","4","1","2","2"',
   '"Painting","Test Coordinator","4","1","2","2"',
   '"Digital Art","Test Coordinator","4","1","2","2"',
   '"Waste to Art","Test Coordinator","4","1","2","2"',
   '"Eco Business Model","Test Coordinator","4","1","2","2"',
  ]);
  expect(report).toEqual(fixture());
 });

 it.each(['=SUM(1,2)', '+cmd', '-cmd', '@SUM(1)', ' =SUM(1)', '\tcmd', '\rcmd', '\ncmd'])('neutralizes spreadsheet formula name %j', name => {
  const report = fixture();
  report.categories.find(c => c.formKey === 'open-letter')!.coordinator = name;
  expect(formatDailyQCCsv(report)).toContain(`"Open Letter","'${name.replaceAll('"', '""')}"`);
 });

 it('escapes CSV quotes and commas and preserves real category counts', () => {
  const report = fixture();
  Object.assign(report.categories.find(c => c.formKey === 'open-letter')!, {coordinator: 'Test, "Coordinator"', submissions: 12, today: 3, completed: 8, remaining: 4});
  expect(formatDailyQCCsv(report)).toContain('"Open Letter","Test, ""Coordinator""","12","3","8","4"');
  expect(formatDailyQCText(report)).toContain('• Total Submissions: 12\n• Total QC Done Today: 3\n• Total QCs Completed Till Date: 8\n• Pending QC: 4');
 });
});
