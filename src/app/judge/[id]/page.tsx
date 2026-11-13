import { JudgePage } from '@/components/judging';
import {redirect} from 'next/navigation';
import {manualReviewMode} from '@/domain/review-mode';
export default async function Page({ params }: { params: Promise<{ id: string }> }) { if(manualReviewMode())redirect('/admin/reference-forms');const { id } = await params; return <JudgePage id={id} />; }
