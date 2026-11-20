import {csvCell} from './rules';

export type DailyQCReport = {
 date: string;
 summary: {totalRegistrations: number; submissions: number; qcCompleted: number; qcCompletedToday: number; qcRemaining: number};
 categories: Array<{formKey: string; title: string; coordinator: string; submissions: number; today: number; completed: number; remaining: number}>;
};

const heading = 'Youth Eco Summit – Daily Submission & QC Summary';
const categoryTitles: Array<[string, string]> = [
 ['open-letter', 'Open Letter'], ['blog-writing', 'Blog'], ['article-writing', 'Article'],
 ['case-study', 'Case Study'], ['short-film-making', 'Short Film'], ['spoken-word', 'Spoken Word Monologue'],
 ['painting', 'Painting'], ['digital-art', 'Digital Art'], ['waste-to-art', 'Waste to Art'],
 ['eco-business-model', 'Eco Business Model'],
];
const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function displayDate(date: string): string {
 const [, month, day] = date.split('-').map(Number);
 const suffix = day % 100 >= 11 && day % 100 <= 13 ? 'th' : ({1: 'st', 2: 'nd', 3: 'rd'} as Record<number, string>)[day % 10] ?? 'th';
 return `${day}${suffix} ${months[month - 1]}`;
}

function categories(report: DailyQCReport) {
 const order = new Map(categoryTitles.map(([key], index) => [key, index]));
 const titles = new Map(categoryTitles);
 return [...report.categories]
  .sort((a, b) => (order.get(a.formKey) ?? order.size) - (order.get(b.formKey) ?? order.size))
  .map(category => ({...category, title: titles.get(category.formKey) ?? category.title}));
}

function summaryRows(report: DailyQCReport): Array<[string, number]> {
 return [
  ['Total Registrations', report.summary.totalRegistrations],
  ['Total Submissions Received Till Date', report.summary.submissions],
  ['Total QCs Completed Till Date', report.summary.qcCompleted],
  ['Total QCs Completed Today', report.summary.qcCompletedToday],
  ['Pending QCs', report.summary.qcRemaining],
 ];
}

export function formatDailyQCText(report: DailyQCReport): string {
 const categoryBlocks = categories(report).map((category, index) => [
  `${index + 1}. ${category.title}`,
  `• Designated Person: ${category.coordinator.replace(/[\r\n]+/g, ' ').trim() || 'Not assigned'}`,
  `• Total Submissions: ${category.submissions}`,
  `• Total QC Done Today: ${category.today}`,
  `• Total QCs Completed Till Date: ${category.completed}`,
  `• Pending QC: ${category.remaining}`,
 ].join('\n'));
 return [
  heading, `Date: ${displayDate(report.date)}`, '', 'Overall Summary', '',
  ...summaryRows(report).map(([label, value]) => `• ${label}: ${value}`),
  '', 'Category-wise QC Update', '', categoryBlocks.join('\n\n'),
 ].join('\n') + '\n';
}

export function formatDailyQCCsv(report: DailyQCReport): string {
 const rows: unknown[][] = [
  [heading], ['Date', report.date], [], ['Overall Summary'], ...summaryRows(report),
  [], ['Category-wise QC Update'],
  ['Category', 'Designated Person', 'Total Submissions', 'Total QC Done Today', 'Total QCs Completed Till Date', 'Pending QC'],
  ...categories(report).map(category => [category.title, category.coordinator.trim() ? category.coordinator : 'Not assigned', category.submissions, category.today, category.completed, category.remaining]),
 ];
 return rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

