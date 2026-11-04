export const metadata = { title: 'Student registration' };
import { StudentRegistrationPage } from '@/components/registration';
import { ReferenceFormPage } from '@/components/reference-form';
export default function Page() { return process.env.PORTAL_REFERENCE_FORMS==='true'?<ReferenceFormPage formKey="student"/>:<StudentRegistrationPage />; }
