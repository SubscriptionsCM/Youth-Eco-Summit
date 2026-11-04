export const metadata = { title: 'Your dashboard' };
import { DashboardPage } from '@/components/participant';
import { ReferenceDashboard } from '@/components/reference-dashboard';
export default function Page() { return process.env.PORTAL_REFERENCE_FORMS==='true'?<ReferenceDashboard/>:<DashboardPage />; }
