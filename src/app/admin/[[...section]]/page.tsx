import { AdminPage } from '@/components/admin';
export default async function Page({ params, searchParams }: { params: Promise<{ section?: string[] }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ section }, query] = await Promise.all([params, searchParams]);
  const filters = new URLSearchParams();
  for (const key of ['id', 'q', 'state', 'editionId', 'competitionId', 'schoolId', 'categoryId', 'judgeId', 'roundId', 'class', 'fileStatus', 'reviewStatus', 'assignment']) {
    const value = query[key];
    if (typeof value === 'string') filters.set(key, value);
  }
  return <AdminPage section={section?.[0]} initialFilters={filters.toString()} />;
}
