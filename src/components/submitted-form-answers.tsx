import {Fragment} from 'react';
import {fieldLabel,isFieldVisible,plainText,type ReferenceForm,type ReferenceField} from '../domain/wordpress-forms';
const readable=new Set(['text','name','email','phone','textarea','number','select','radio','checkbox','date','time','url','consent','address']);
function display(value:unknown):string{
 if(value===true)return 'Accepted';if(value===false)return 'Not accepted';
 if(Array.isArray(value))return value.map(display).join(', ');
 if(value&&typeof value==='object')return Object.values(value).map(display).filter(Boolean).join(', ');
 return value==null?'':String(value);
}
export function SubmittedFormAnswers({form,record}:{form:ReferenceForm;record:Record<string,any>}){
 if(record.details_pending)return <p>Your submission was received. Reload this page to view the submitted information.</p>;
 const answers=record.answers||{},fields:ReferenceField[]=Array.isArray(record.form_snapshot?.fields)?record.form_snapshot.fields:form.fields;
 const shown=fields.filter(field=>readable.has(field.type)&&!field.id.startsWith('_')&&!/password|secret|token/i.test(field.id)&&isFieldVisible(field,answers)&&answers[field.id]!==undefined);
 return <section><h2>Submitted information</h2><dl>{shown.map(field=><Fragment key={field.id}><dt>{plainText(fieldLabel(field,answers)||field.id)}</dt><dd>{display(answers[field.id])}</dd></Fragment>)}</dl></section>;
}
