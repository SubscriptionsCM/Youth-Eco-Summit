import type { Metadata } from 'next';
import { GetInvolved } from '@/components/get-involved';
import { CampaignMotion } from '@/components/campaign-motion';
export const metadata: Metadata = { title: 'Get involved', description: 'Join Youth Eco Summit as a student, educator, school or partner organization.' };
export default function Page() { return <CampaignMotion><GetInvolved standalone /></CampaignMotion>; }
