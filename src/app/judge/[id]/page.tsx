import { JudgePage } from '@/components/judging';
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <JudgePage id={id} />; }
