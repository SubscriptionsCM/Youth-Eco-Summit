import type {ReferenceField} from './wordpress-forms';
const enabled=(value:unknown)=>value===true||value==='true'||value==='1'||value===1;
const nameDefinitions=[['prefix','prefix','Prefix','honorific-prefix'],['fname','first-name','First Name','given-name'],['mname','middle-name','Middle Name','additional-name'],['lname','last-name','Last Name','family-name']] as const;
export function nameParts(field:ReferenceField){
 return nameDefinitions.filter(([flag])=>enabled(field[flag])).map(([flag,key,label,autocomplete])=>({key,label:String(field[`${flag}_label`]||label),required:enabled(field[`${flag}_required`]),autocomplete}));
}
export const structuredAnswerKeys:Record<string,readonly string[]>={
 name:['prefix','first-name','middle-name','last-name'],
 address:['street_address','address_line','city','address_city','state','address_state','zip','address_zip','country','address_country'],
};
const scalar=(value:unknown)=>typeof value==='string'||typeof value==='number'?String(value):'';
/** Order is independent of PostgreSQL JSONB key ordering. Never traverse arbitrary objects. */
export function displayReferenceValue(type:string,value:unknown):string{
 if(value===true)return 'Accepted';if(value===false)return 'Not accepted';
 if(Array.isArray(value))return value.map(scalar).filter(Boolean).join(', ');
 if(!value||typeof value!=='object')return scalar(value);
 const parts=value as Record<string,unknown>;
 if(type==='name')return structuredAnswerKeys.name.map(key=>scalar(parts[key])).filter(Boolean).join(' ');
 if(type==='address')return ['street_address','address_line','city','state','zip','country'].map(key=>scalar(parts[key])||scalar(parts[`address_${key}`])).filter(Boolean).join(', ');
 return '';
}
