import { EntryPage } from '@/components/entry';
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <EntryPage id={id} />; }
