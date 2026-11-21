import {canUseForm,canUseSchoolWorkspace,type ParticipantKind} from '../domain/participant-access';
import type { LoginAudience } from '../domain/login-audience';
const localOrigin = 'https://youth-eco.local';

/** Accept a local page destination without allowing an open redirect. */
export function safeReturnPath(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020\u007f]/.test(value)) return null;
  try {
    const url = new URL(value, localOrigin);
    const decodedPath = decodeURIComponent(url.pathname);
    if (url.origin !== localOrigin || decodedPath.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(decodedPath)) return null;
    // These are endpoints or sign-in/setup pages, not a post-login destination.
    if (/^\/(?:api|login|invite|recover)(?:\/|$)/.test(decodedPath)) return null;
    if (/^\/judge\/login(?:\/|$)/.test(decodedPath)) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return null; }
}

export function dashboardPath(role?: string): string {
  return role === 'judge' ? '/judge' : role === 'owner' || role === 'admin' ? '/admin' : '/dashboard';
}

export function dashboardLabel(role?: string): string {
  return role === 'judge' ? 'Judging dashboard' : role === 'owner' || role === 'admin' ? 'Administration' : 'My dashboard';
}

export function loginAudienceFromSearch(search:string):LoginAudience {
  const parameters=new URLSearchParams(search),type=parameters.get('type');
  if(type==='student'||type==='educator'||type==='school'||type==='admin')return type;
  const next=safeReturnPath(parameters.get('next'));
  if(!next)return 'student';
  const parsed=new URL(next,localOrigin),path=decodeURIComponent(parsed.pathname);
  if(/^\/(admin|judge)(\/|$)/.test(path))return 'admin';
  if(/^\/(?:teachers|forms\/teacher)(?:\/|$)/.test(path)||(/^\/(?:forms\/|competitions\/enter(?:\/|$))/.test(path)&&parsed.searchParams.get('submitter')==='educator'))return 'educator';
  if(/^\/(?:school(?:s\/register)?|forms\/school)(?:\/|$)/.test(path))return 'school';
  return 'student';
}

export function loginPath(destination?: unknown, type?:LoginAudience): string {
  const next = safeReturnPath(destination);
  const parameters=new URLSearchParams({...type?{type}:{},...next?{next}:{}});
  return parameters.size ? `/login?${parameters}` : '/login';
}

export function judgeLoginPath(destination?:unknown):string{
  const next=safeReturnPath(destination);
  return next?`/judge/login?${new URLSearchParams({next})}`:'/judge/login';
}

export function afterLoginPath(role: string, destination?: unknown, kind?:ParticipantKind|null): string {
  const next = safeReturnPath(destination);
  if (!next) return dashboardPath(role);
  const parsed=new URL(next,localOrigin),pathname=decodeURIComponent(parsed.pathname).replace(/\/+$/,'')||'/',actor={role,participantKind:kind};
  if (/^\/admin(?:\/|$)/.test(pathname) && !['owner', 'admin'].includes(role)) return dashboardPath(role);
  if (/^\/judge(?:\/|$)/.test(pathname) && !['owner', 'admin', 'judge'].includes(role)) return dashboardPath(role);
  if (/^\/dashboard(?:\/|$)/.test(pathname) && role !== 'participant') return dashboardPath(role);
  if (/^\/teams(?:\/|$)/.test(pathname) && !canUseForm(actor,'student')) return dashboardPath(role);
  const registration=pathname==='/register'?'student':pathname==='/teachers/register'?'teacher':pathname==='/schools/register'?'school':null;
  if(registration&&!canUseForm(actor,registration))return dashboardPath(role);
  if(pathname==='/school'&&!canUseSchoolWorkspace(actor))return dashboardPath(role);
  if(pathname==='/competitions/enter'&&(!canUseForm(actor,'painting',parsed.searchParams.get('submitter'))))return dashboardPath(role);
  if(pathname.startsWith('/forms/')){const saved=new URLSearchParams(parsed.hash.slice(1)).has('saved');if(saved?!['participant','owner','admin'].includes(role):!canUseForm(actor,pathname.split('/')[2],parsed.searchParams.get('submitter')))return dashboardPath(role);}
  if (/^\/(?:entries|history)(?:\/|$)/.test(pathname) && role === 'judge') return dashboardPath(role);
  if (/^\/files(?:\/|$)/.test(pathname) && !['participant','owner','admin'].includes(role)) return dashboardPath(role);
  return next;
}

/** Keep the appropriate sign-in flow after a deliberate sign-out. */
export function signedOutPath(role?:string,kind?:ParticipantKind|null):string{
 return role==='judge'?'/judge/login':['owner','admin'].includes(role||'')?loginPath('/admin'):kind==='educator'||kind==='school'?loginPath(undefined,kind):'/login';
}
