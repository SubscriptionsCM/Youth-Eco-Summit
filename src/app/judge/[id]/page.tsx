import {DedicatedJudgePage} from '@/components/judge-portal';
import { JudgePage } from '@/components/judging';
import {redirect} from 'next/navigation';
import {manualReviewMode,dedicatedJudgingMode} from '@/domain/review-mode';
export default async function Page({ params }: { params: Promise<{ id: string }> }) { if(dedicatedJudgingMode()){const {id}=await params;return <DedicatedJudgePage id={id}/>;}if(manualReviewMode())redirect('/admin/reference-forms');const { id } = await params; return <JudgePage id={id} />; }
