import { TeacherRegistrationPage } from '@/components/registration';
import { ReferenceFormPage } from '@/components/reference-form';
export const metadata = { title: 'Educator registration' };
export default function Page() { return process.env.PORTAL_REFERENCE_FORMS==='true'?<ReferenceFormPage formKey="teacher"/>:<TeacherRegistrationPage />; }
