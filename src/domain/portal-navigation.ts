export type PortalItem={label:string;href:string};
export type PortalGroup={label:string;items:PortalItem[];primary?:boolean};
const item=(label:string,href:string):PortalItem=>({label,href});
export const adminTitles:Record<string,string>={overview:'Overview',judging:'Manage judging','reference-forms':'Forms inbox','wordpress-history':'WordPress archive',files:'File library',repairs:'File recovery',schools:'Schools',nominations:'School nominations','partner-enquiries':'Partner enquiries',teachers:'Educators',students:'Students',entries:'Competition entries',judges:'Reviewer accounts',assignments:'Assignments',rules:'Assignment rules',rounds:'Review rounds',reviews:'Reviews',results:'Results',editions:'Summit editions',competitions:'Competitions',content:'Website content',trash:'Trash',audit:'Activity log',jobs:'Background tasks',imports:'Imports'};
export function portalGroups(role:string,mode='portal'):PortalGroup[]{
 if(role==='participant')return [
  {label:'Your workspace',primary:true,items:[item('My forms & entries','/dashboard'),item('New competition entry','/competitions/enter')]},
  {label:'Registration & schools',items:[item('Student registration','/register'),item('Educator registration','/teachers/register'),item('School registration','/schools/register'),item('Find your school','/schools')]}
 ];
 if(role==='judge')return [{label:'Review workspace',primary:true,items:[item('Assigned entries','/judge'),item('Competition guidelines','/competitions')]}];
 if(!['owner','admin'].includes(role))return [];
 const admin=(key:string)=>item(adminTitles[key],key==='overview'?'/admin':`/admin/${key}`);
 return [
  {label:'Workspace',primary:true,items:['overview','reference-forms','wordpress-history'].map(admin)},
  {label:'Judging',items:mode==='portal'?[admin('judging'),item('My assigned entries','/judge'),admin('judges')]:mode==='legacy'?['judges','assignments','rules','rounds','reviews','results'].map(admin):[]},
  {label:'People & enquiries',items:['schools','teachers','students','entries','nominations','partner-enquiries'].map(admin)},
  {label:'Summit setup',items:['editions','competitions','content'].map(admin)},
  {label:'Operations',items:['files','repairs','jobs','imports','audit','trash'].map(admin)}
 ].filter(group=>group.items.length);
}
export function isWorkspacePath(path:string){
 if(path==='/judge/login'||path.startsWith('/judge/login/'))return false;
 return ['/admin','/dashboard','/judge','/forms','/history','/entries','/files','/teams','/register','/teachers/register','/schools/register','/competitions/enter'].some(root=>path===root||path.startsWith(root+'/'));
}
export function isPortalLinkActive(path:string,href:string){
 const aliases:Record<string,string>={'/forms/student':'/register','/forms/teacher':'/teachers/register','/forms/school':'/schools/register'};
 path=aliases[path]||path;
 return path===href||(href!=='/admin'&&path.startsWith(href+'/'));
}
export function portalLocation(path:string){
 if(path==='/admin')return 'Overview';
 if(path.startsWith('/admin/'))return adminTitles[path.split('/')[2]]||'Administration';
 if(path.startsWith('/history/'))return 'Earlier entry';
 if(path.startsWith('/forms/'))return 'Saved form';
 if(path.startsWith('/judge/'))return 'Review entry';
 const labels:Record<string,string>={'/dashboard':'My forms & entries','/judge':'Assigned entries','/register':'Student registration','/teachers/register':'Educator registration','/schools/register':'School registration','/competitions/enter':'New competition entry'};
 return labels[path]||'Workspace';
}
