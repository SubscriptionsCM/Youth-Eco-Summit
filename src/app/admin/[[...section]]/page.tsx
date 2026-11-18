import {JudgeAdministration} from '@/components/judge-portal-admin';
import '../../judge-portal.css';
import { AdminPage } from '@/components/admin';
import {redirect} from 'next/navigation';
import {manualReviewMode,dedicatedJudgingMode,assignedReviewSections} from '@/domain/review-mode';
import {currentAdminDestination} from '@/domain/portal-navigation';
export default async function Page({ params, searchParams }: { params: Promise<{ section?: string[] }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ section }, query] = await Promise.all([params, searchParams]);
  if(section?.[0]==='judging'&&section.length===1)return <JudgeAdministration/>;
  if(manualReviewMode()&&(!section?.length||assignedReviewSections.has(section[0])))redirect('/admin/reference-forms');
  const filters = new URLSearchParams();
  for (const key of ['id', 'q', 'formKey', 'state', 'editionId', 'competitionId', 'schoolId', 'categoryId', 'judgeId', 'roundId', 'class', 'fileStatus', 'reviewStatus', 'assignment']) {
    const value = query[key];
    if (typeof value === 'string') filters.set(key, value);
  }
  const destination=currentAdminDestination(section?.[0]||'overview',filters,dedicatedJudgingMode()?'portal':manualReviewMode()?'manual':'legacy');
  if(destination)redirect(destination);
  return <AdminPage section={section?.[0]} initialFilters={filters.toString()} />;
}
