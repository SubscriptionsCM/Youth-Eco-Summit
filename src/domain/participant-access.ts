import {competitionGuidelines2027} from '../data/guidelines-2027';

export type ParticipantKind='student'|'educator'|'school'|'unclassified';
export type AccessActor={role?:string;participantKind?:ParticipantKind|null};
export function participantKind(actor?:AccessActor|null):ParticipantKind{
 return actor?.role==='participant'&&['student','educator','school'].includes(actor.participantKind||'')?actor.participantKind as ParticipantKind:'unclassified';
}
export function entrySubmitter(actor?:AccessActor|null):'student'|'educator'|null{
 const kind=participantKind(actor);return kind==='student'||kind==='educator'?kind:null;
}
export function canUseSchoolWorkspace(actor?:AccessActor|null){return ['educator','school'].includes(participantKind(actor));}
/** Registration permissions come from the authenticated profile, never a selected URL role. */
export function canUseForm(actor:AccessActor|null|undefined,formKey:string,submitter?:unknown):boolean{
 if(['nomination','partner','legacy-12146'].includes(formKey))return true;
 if(formKey.startsWith('legacy-'))return false;
 if(!actor||actor.role!=='participant')return false;
 const kind=participantKind(actor);
 if(formKey==='student')return kind==='student';
 if(formKey==='teacher')return kind==='educator';
 if(formKey==='school')return kind==='school';
 if(competitionGuidelines2027.some(competition=>competition.slug===formKey)){
  const ownRole=entrySubmitter(actor);return !!ownRole&&(submitter===undefined||submitter===null||submitter===''||submitter===ownRole);
 }
 return false;
}
