import { LiveReferencePage } from '@/components/live-reference-page';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Get involved', description: 'Join Youth Eco Summit as a student, educator, school or partner organization.' };
export default function Page() { return <LiveReferencePage path="/get-involved" />; }
