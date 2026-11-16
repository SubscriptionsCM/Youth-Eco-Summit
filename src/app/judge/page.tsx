export const metadata = { title: 'Judging dashboard' };
import {DedicatedJudgePage} from '@/components/judge-portal';
import { JudgePage } from '@/components/judging';
import {redirect} from 'next/navigation';
import {manualReviewMode,dedicatedJudgingMode} from '@/domain/review-mode';
export const dynamic='force-dynamic';
export default function Page() { if(dedicatedJudgingMode())return <DedicatedJudgePage/>;if(manualReviewMode())redirect('/admin/reference-forms');return <JudgePage />; }
