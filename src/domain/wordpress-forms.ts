import snapshot from '../data/wordpress-forms.json';
import { competitionGuidelines2027 } from '../data/guidelines-2027';
import { participationWindow, participationWindowStatus } from '../data/participation-window';
import {nameParts} from './reference-values';

export type Answers = Record<string, unknown>;
export type ReferenceField = Record<string, any> & { id: string; type: string; field_label?: string; conditions?: { element_id: string; rule: string; value: string }[] };
export type ReferenceForm = { id: number; key: string; title: string; competition: boolean; fields: ReferenceField[]; settings: Record<string, any> };
export const referenceForms = snapshot.forms as ReferenceForm[];
export const referenceCapturedAt = snapshot.capturedAt;
export const enabled = (value: unknown) => value === true || value === 'true' || value === '1' || value === 1;
export const plainText = (value: unknown) => String(value ?? '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim();
export function fieldOptions(field: ReferenceField): { label: string; value: string }[] {
 return (field.catalogue ? (snapshot.catalogues as Record<string, any>)[field.catalogue] : field.options) || [];
}
export function isFieldVisible(field: ReferenceField, answers: Answers): boolean {
 if (!field.conditions?.length) return true;
 const matches = field.conditions.map(condition => {
  const actual = answers[condition.element_id];
  const equal = Array.isArray(actual) ? actual.map(value=>String(value).trim()).includes(String(condition.value).trim()) : String(actual ?? '').trim() === String(condition.value).trim();
  if (condition.rule === 'is') return equal;
  if (condition.rule === 'is_not') return !equal;
  // Unsupported reference rules must fail closed, never silently expose hidden data.
  return false;
 });
 const result = field.condition_rule === 'any' ? matches.some(Boolean) : matches.every(Boolean);
 // Forminator defaults to show when condition_action is absent.
 return field.condition_action === 'hide' ? !result : result;
}
export function visibleFields(form: ReferenceForm, answers: Answers) { return form.fields.filter(field => isFieldVisible(field, answers)); }
export function fieldLabel(field: ReferenceField, answers: Answers): string {
 const solo = answers['radio-yes-entry-mode'] !== 'team';
 const label = String(field.field_label || '');
 return solo ? label.replace(/^Student 1\b/, 'Student') : label;
}
export function formTitle(form: ReferenceForm) {
 return ({ student: 'Student registration', teacher: 'Educator registration', school: 'School registration', partner: 'Partner enquiry', nomination: 'Nominate your school', 'legacy-12146': 'Contact us' } as Record<string,string>)[form.key] || competitionGuidelines2027.find(g=>g.slug===form.key)?.title || form.title;
}
export function formSteps(form: ReferenceForm) {
 const steps: { label: string; fields: ReferenceField[] }[] = [];
 let fields: ReferenceField[] = [];
 for (const field of form.fields) {
  if (field.type === 'page-break') {
   steps.push({ label: form.settings.paginationData?.[`${field.id}-steps`] || `Step ${steps.length + 1}`, fields }); fields = [];
  } else fields.push(field);
 }
 steps.push({ label: form.settings.paginationData?.['last-steps'] || (steps.length ? 'Review' : formTitle(form)), fields });
 return steps;
}
export function validateReferenceAnswers(form: ReferenceForm, input: Answers, options: { final: boolean; now?: Date; step?: number }) {
 const answers: Answers = {}, errors: Record<string,string> = {};
 const final = options.final, guideline = competitionGuidelines2027.find(g=>g.slug===form.key);
 const controls = new Set(['html','section','group','page-break','upload','password']);
 const scoped = options.step === undefined ? form.fields : formSteps(form).slice(0, options.step + 1).flatMap(s=>s.fields);
 for (const field of scoped) {
  if (controls.has(field.type) || !isFieldVisible(field, input)) continue;
  if (field.type === 'consent' && !final) continue;
  const raw = input[field.id], label = fieldLabel(field,input) || field.id;
  if(field.type==='name'&&enabled(field.multiple_name)){
   const parts=nameParts(field),values:Record<string,string>={};
   if(raw!==undefined&&raw!==null&&(typeof raw!=='object'||Array.isArray(raw))){errors[field.id]='Enter each name part separately.';continue;}
   for(const part of parts){
    const value=(raw as Record<string,unknown>|null)?.[part.key];
    if(value!==undefined&&typeof value!=='string'){errors[field.id]=`Enter a valid ${part.label.toLowerCase()}.`;continue;}
    const cleaned=String(value??'').trim();
    if(cleaned.length>1000||(final&&part.required&&!cleaned))errors[field.id]=`${part.label} is required.`;
    values[part.key]=cleaned;
   }
   if(raw!==undefined&&raw!==null)answers[field.id]=values;
   continue;
  }
  const missing = raw === undefined || raw === null || (typeof raw==='string'&&raw.trim()==='') || (Array.isArray(raw) && (!raw.length||raw.every(value=>String(value).trim()==='')));
  if (missing) { if (final && (enabled(field.required) || (field.type==='address'&&['street_address','address_city','address_state'].some(part=>enabled(field[`${part}_required`]))))) errors[field.id] = `${label} is required.`; continue; }
  if (field.type === 'consent') {
   if (raw !== true) { errors[field.id] = `Please confirm ${label.toLowerCase()}.`; continue; }
   answers[field.id] = true; continue;
  }
  if (field.type === 'address') {
   if (typeof raw !== 'object' || Array.isArray(raw)) { errors[field.id] = 'Enter a valid address.'; continue; }
   const address: Record<string,string> = {};
   for (const part of ['street_address','address_line','address_city','address_state','address_zip','address_country']) {
    if (!enabled(field[part])) continue;
    const value = String((raw as Record<string,unknown>)[part] || '').trim();
    if (value.length > 1000 || (final && enabled(field[`${part}_required`]) && !value)) errors[field.id] = `${field[`${part}_label`] || part} is required.`;
    address[part] = value;
   }
   answers[field.id] = address; continue;
  }
  if (typeof raw !== 'string' && typeof raw !== 'number' && !Array.isArray(raw)) { errors[field.id] = 'Enter a valid value.'; continue; }
  const value = Array.isArray(raw) ? raw.map(v=>String(v).trim()) : String(raw).trim();
  if ((Array.isArray(value) ? value.join('') : value).length > 20000) { errors[field.id] = 'This answer is too long.'; continue; }
  if (field.type === 'email' && (typeof value !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || value.length > 254)) errors[field.id] = 'Enter a valid email address.';
  if(field.type==='phone'){
   const mode=field.validation??(enabled(field.phone_validation)?'':'none');
   const pattern=mode==='international'?/^\+?[\d\s()\-]{10,20}$/:mode==='standard'?/^[\d\s()\-.+]{5,20}$/:null;
   if(typeof value!=='string'||(mode!=='none'&&((mode==='character_limit'&&new TextEncoder().encode(value).length>Number(field.limit??10))||(pattern&&!pattern.test(value))||/[a-z]|[^\w\-()+. ]|[\-()+.]{2,}/i.test(value))))errors[field.id]=plainText(field.validation_message)||'Enter a valid phone number in the required format.';
  }
  if (field.type === 'number') {
   const n = Number(value);
   if (!Number.isFinite(n) || (field.limit_min !== undefined && field.limit_min !== '' && n < Number(field.limit_min)) || (field.limit_max !== undefined && field.limit_max !== '' && n > Number(field.limit_max))) errors[field.id] = 'Enter a number within the permitted range.';
  }
  if (['select','radio','checkbox'].includes(field.type) && !(field.catalogue&&['student','teacher'].includes(form.key))) {
   const allowed = fieldOptions(field).map(option=>String(option.value));
   if ((Array.isArray(value) ? value : [value]).some(option=>!allowed.includes(option))) errors[field.id] = 'Choose a listed option.';
  }
  answers[field.id] = value;
 }
 if (form.competition) {
  const role = input['hidden-yes-submitter'], mode = input['radio-yes-entry-mode'];
  if ((final || role) && !['student','educator'].includes(String(role))) errors['hidden-yes-submitter'] = 'Choose Student or Educator.';
  if ((final || mode) && !['individual','team'].includes(String(mode))) errors['radio-yes-entry-mode'] = 'Choose individual or team.';
  if (mode === 'team') {
   const size = Number(input['number-yes-team-size']);
   if (!guideline?.team.allowed || !Number.isInteger(size) || size < 2 || size > guideline.team.maxMembers) errors['number-yes-team-size'] = 'Choose an allowed whole-number team size.';
  }
  if (final && options.step===undefined && guideline) {
   const size = mode === 'team' ? Math.min(Number(input['number-yes-team-size']) || 1, guideline.team.maxMembers) : 1;
   const names = new Set<string>();
   for (let i = 1; i <= size; i++) {
    const key = i === 1 ? 'text-yes-name' : `text-yes-student-${i}`;
    const name = String(input[key] || '').trim().toLowerCase();
    if (name.length < 2 || names.has(name)) errors[key] = 'List each participating student once with their full name.';
    names.add(name);
    const classKey = i === 1 ? 'select-yes-class' : `select-yes-class-${i}`;
    if (!guideline.classes.includes(Number(input[classKey]))) errors[classKey] = 'Choose a class eligible for this competition.';
   }
   const topics = guideline.classTopics.filter(group=>group.classes.includes(Number(input['select-yes-class']))).flatMap(group=>group.topics.map(topic=>topic.title));
   if (!topics.includes(String(input['select-yes-topic']))) errors['select-yes-topic'] = 'Choose a published topic for the student’s class.';
   if (!/^[\p{L}\p{N}]+(?:_[\p{L}\p{N}]+)+$/u.test(String(input['text-yes-title'] || ''))) errors['text-yes-title'] = 'Use SchoolName_Class_Category_ProjectTitle_Authors with underscores.';
  }
 }
 if(['student','teacher'].includes(form.key)&&typeof input['registered-school-id']==='string')answers['registered-school-id']=input['registered-school-id'];
 if (final && options.step===undefined && (form.competition || form.key === 'student') && !participationWindowStatus(options.now || new Date()).isOpen) errors._form = `Student registration and competition submissions are closed. The deadline is ${participationWindow.deadlineLabel}.`;
 return { answers, errors };
}
