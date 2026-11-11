import { RetainedFilePage } from '@/components/retained-form-files';
export const metadata = { title: 'Submitted file' };
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RetainedFilePage fileId={id}/>;
}
