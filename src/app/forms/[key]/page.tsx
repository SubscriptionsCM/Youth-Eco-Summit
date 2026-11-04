import { notFound } from 'next/navigation';
import { referenceForms } from '@/domain/wordpress-forms';
import { ReferenceFormPage } from '@/components/reference-form';
export default async function Page({params}:{params:Promise<{key:string}>}) {
 const {key}=await params;if(!referenceForms.some(form=>form.key===key))notFound();
 return <ReferenceFormPage formKey={key}/>;
}
