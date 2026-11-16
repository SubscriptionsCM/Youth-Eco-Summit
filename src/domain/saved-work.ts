import {formTitle,referenceForms} from './wordpress-forms';
export type SavedWork={id:string;form_key?:string;reference?:string;status?:string;[key:string]:unknown};
export function savedWorkTitle(record:SavedWork){const form=referenceForms.find(f=>f.key===record.form_key);return form?formTitle(form):'Saved form';}
export function filterSavedWork<T extends SavedWork>(records:readonly T[],status:string,query:string):T[]{
 const q=query.trim().toLocaleLowerCase();
 return records.filter(r=>(status==='all'||r.status===status)&&(!q||`${r.reference||''} ${savedWorkTitle(r)}`.toLocaleLowerCase().includes(q)));
}
