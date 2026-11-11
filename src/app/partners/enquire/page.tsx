import { PartnerEnquiryPage } from '@/components/partner-enquiry';
import { ReferenceFormPage } from '@/components/reference-form';
export const metadata = { title: 'Partner with Youth Eco Summit', description: 'Tell us how your organization would like to contribute to Youth Eco Summit.' };
export const dynamic = 'force-dynamic';
export default function Page() { return process.env.PORTAL_REFERENCE_FORMS==='true'?<ReferenceFormPage formKey="partner"/>:<PartnerEnquiryPage />; }
