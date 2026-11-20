export type PortalItem={label:string;href:string};
export type PortalGroup={label:string;items:PortalItem[];primary?:boolean;root?:string};
const item=(label:string,href:string):PortalItem=>({label,href});
export const adminTitles:Record<string,string>={'school-records':'School record links',overview:'Overview',judging:'Manage judging','reference-forms':'Forms inbox','wordpress-history':'WordPress archive',files:'File library',repairs:'File recovery',schools:'Schools',nominations:'School nominations','partner-enquiries':'Partner enquiries',teachers:'Educators',students:'Students',entries:'Competition entries',judges:'Staff accounts',assignments:'Assignments',rules:'Assignment rules',rounds:'Review rounds',reviews:'Reviews',results:'Results',editions:'Summit editions',competitions:'Competitions',content:'Website content',trash:'Trash',audit:'Activity log',jobs:'Background tasks',imports:'Imports',tools:'Tools'};
export function portalGroups(role:string,mode='portal'):PortalGroup[]{
 if(role==='participant')return [
  {label:'Your workspace',primary:true,items:[item('My forms & entries','/dashboard'),item('New competition entry','/competitions/enter')]},
  {label:'School workspace',items:[item('My school','/school')]},
  {label:'Registration & schools',items:[item('Student registration','/register'),item('Educator registration','/teachers/register'),item('School registration','/schools/register'),item('Find your school','/schools')]}
 ];
 if(role==='judge')return [{label:'Review workspace',primary:true,items:[item('Assigned entries','/judge'),item('Competition guidelines','/competitions')]}];
 if(!['owner','admin'].includes(role))return [];
 const admin=(key:string)=>item(adminTitles[key],key==='overview'?'/admin':`/admin/${key}`);
 if(mode==='portal')return [
  {label:'Daily work',primary:true,items:[item('Dashboard','/admin'),item('Submissions & quality checks','/admin/reports'),item('New website forms','/admin/reference-forms')]},
  {label:'Schools',items:[admin('schools'),item('School access','/admin/school-access'),item('Link earlier school records','/admin/school-records')]},
  {label:'Judging',items:['judging','judges'].map(admin)},
  {label:'Earlier records',items:[item('Earlier forms & files','/admin/wordpress-history')]},
  {label:'Tools',root:'/admin/tools',items:['jobs','audit','trash'].map(admin)}
 ];
 return [
  {label:'Workspace',primary:true,items:['overview','reference-forms','wordpress-history'].map(admin)},
  {label:'Judging',items:mode==='portal'?[admin('judging'),item('My assigned entries','/judge'),admin('judges')]:mode==='legacy'?['judges','assignments','rules','rounds','reviews','results'].map(admin):[]},
  {label:'People & enquiries',items:['schools','teachers','students','entries','nominations','partner-enquiries'].map(admin)},
  {label:'Summit setup',items:['editions','competitions','content'].map(admin)},
  {label:'Operations',items:['files','repairs','jobs','imports','audit','trash'].map(admin)}
 ].filter(group=>group.items.length);
}
/** Older menu URLs lead to the current website workflow; stored records and APIs are retained. */
export function currentAdminDestination(section:string,query:URLSearchParams,mode='portal'):string|null{
 if(mode!=='portal')return null;
 const forms:Record<string,string>={students:'student',teachers:'teacher',nominations:'nomination','partner-enquiries':'partner',entries:''};
 if(Object.hasOwn(forms,section)){
  const filters=new URLSearchParams();
  for(const key of ['schoolId','q']){const value=query.get(key);if(value)filters.set(key,value);}
  const formKey=forms[section]||query.get('formKey');if(formKey)filters.set('formKey',formKey);
  const search=filters.toString();return '/admin/reference-forms'+(search?'?'+search:'');
 }
 if(['assignments','rules','rounds','reviews','results'].includes(section))return '/admin/judging';
 if(['files','repairs','imports','editions','competitions','content'].includes(section))return '/admin/tools';
 return null;
}
export function isWorkspacePath(path:string){
 if(path==='/judge/login'||path.startsWith('/judge/login/'))return false;
 return ['/admin','/dashboard','/school','/judge','/forms','/history','/entries','/files','/teams','/register','/teachers/register','/schools/register','/competitions/enter'].some(root=>path===root||path.startsWith(root+'/'));
}
export function isPortalLinkActive(path:string,href:string){
 if(href==='/admin/tools'&&['/admin/jobs','/admin/audit','/admin/trash'].some(root=>path===root||path.startsWith(root+'/')))return true;
 const aliases:Record<string,string>={'/forms/student':'/register','/forms/teacher':'/teachers/register','/forms/school':'/schools/register'};
 path=aliases[path]||path;
 return path===href||(href!=='/admin'&&path.startsWith(href+'/'));
}
export function portalLocation(path:string){
 if(path==='/admin')return 'Dashboard';
 if(path==='/school')return 'My school';
 if(path==='/admin/reports')return 'Submissions & quality checks';
 if(path==='/admin/school-access')return 'School access';
 if(path.startsWith('/admin/'))return adminTitles[path.split('/')[2]]||'Administration';
 if(path.startsWith('/history/'))return 'Earlier entry';
 if(path.startsWith('/forms/'))return 'Saved form';
 if(path.startsWith('/judge/'))return 'Review entry';
 const labels:Record<string,string>={'/dashboard':'My forms & entries','/judge':'Assigned entries','/register':'Student registration','/teachers/register':'Educator registration','/schools/register':'School registration','/competitions/enter':'New competition entry'};
 return labels[path]||'Workspace';
}
