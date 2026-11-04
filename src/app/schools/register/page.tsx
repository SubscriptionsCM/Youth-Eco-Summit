export const metadata = { title: 'School registration' };
import { SchoolRegistrationPage } from '@/components/registration';
import { ReferenceFormPage } from '@/components/reference-form';
export default function Page() { return process.env.PORTAL_REFERENCE_FORMS==='true'?<ReferenceFormPage formKey="school"/>:<SchoolRegistrationPage />; }
