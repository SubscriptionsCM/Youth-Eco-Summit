import type {Answers, ReferenceField, ReferenceForm} from './wordpress-forms';

export const schoolNominationDesignations = ['Teacher', 'Principal', 'Vice principal', 'Senior coordinator', 'Other'];

/** Keep the captured source intact; only the current native nomination uses this schema. */
export function nativeSchoolNomination(form: ReferenceForm): ReferenceForm {
 if (form.id !== 8916 || form.key !== 'nomination') return form;
 const original = (id: string) => form.fields.find(field => field.id === id) || {id, type: 'text'};
 return {...form, fields: [
  {id: 'select-1', type: 'text', field_label: 'School name', required: '1', max_length: 200, placeholder: 'Enter the school’s full name and branch'},
  {...original('address-1'), required: '', address_city_required: '', address_state_required: ''},
  {id: 'name-2', type: 'name', field_label: 'School contact name', required: '1', max_length: 160},
  {id: 'select-2', type: 'select', field_label: 'Designation', required: '1', options: schoolNominationDesignations.map(value => ({label: value, value}))},
  {id: 'text-2', type: 'text', field_label: 'Other designation', required: '1', max_length: 100, conditions: [{element_id: 'select-2', rule: 'is', value: 'Other'}]},
  {id: 'email-2', type: 'email', field_label: 'School contact email', max_length: 254, description: 'Provide at least one school contact email or phone number.'},
  {id: 'phone-2', type: 'phone', field_label: 'School contact phone', validation: 'none', max_length: 40, description: 'Include the country code when available. Provide at least one school contact email or phone number.'},
  {...original('name-1'), required: '', max_length: 160},
  {...original('email-1'), required: '', max_length: 254},
  {...original('phone-1'), required: '', validation: 'none', max_length: 40},
 ]};
}

export function normalizeSchoolNominationAnswers(input: Answers): Answers {
 if (typeof input['select-1'] !== 'string' || input['select-1'].trim() !== 'Others') return input;
 return {...input, 'select-1': input['text-1'] ?? ''};
}

export function validateSchoolNominationAnswers(input: Answers, answers: Answers, fields: ReferenceField[], errors: Record<string, string>, final: boolean) {
 for (const field of fields) {
  const raw = input[field.id];
  if (raw === undefined || raw === null || field.type === 'address') continue;
  if (typeof raw !== 'string') { errors[field.id] = 'Enter a single text value.'; continue; }
  const value = raw.trim();
  if (field.max_length && value.length > field.max_length) errors[field.id] = `Use ${field.max_length} characters or fewer.`;
  if (field.type === 'phone' && value) {
   const digits = value.replace(/\D/g, '');
   if (!/^\+?(?:\d|\(\d{1,5}\))(?:(?:\s+|[.-])?(?:\d|\(\d{1,5}\)))*$/.test(value) || digits.length < 7 || digits.length > 15) errors[field.id] = 'Enter a valid phone number with 7 to 15 digits, including the country code when available.';
  }
 }
 if (final && !answers['email-2'] && !answers['phone-2']) {
  const message = 'Provide a school contact email or phone number.';
  errors['email-2'] = message;
  errors['phone-2'] = message;
 }
}
