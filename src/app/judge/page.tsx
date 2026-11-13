export const metadata = { title: 'Judging dashboard' };
import { JudgePage } from '@/components/judging';
import {redirect} from 'next/navigation';
import {manualReviewMode} from '@/domain/review-mode';
export const dynamic='force-dynamic';
export default function Page() { if(manualReviewMode())redirect('/admin/reference-forms');return <JudgePage />; }
