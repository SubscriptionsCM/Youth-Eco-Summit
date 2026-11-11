export const metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';
import { LoginPage } from '@/components/auth-pages';
import { ReferenceLogin } from '@/components/reference-login';
export default function Page() { return process.env.AUTH_PARTICIPANT_PROVIDER==='supabase'?<ReferenceLogin/>:<LoginPage />; }
