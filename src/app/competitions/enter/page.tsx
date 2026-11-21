import { EntryJourney } from '@/components/entry-journey';
export const metadata={title:'Submit your entry'};
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
 const params=await searchParams;
 const value=(key:string)=>typeof params[key]==='string'?params[key] as string:'';
 const mode=['individual','team'].includes(value('mode'))?value('mode'):value('entry_type');
 return <EntryJourney key={[value('submitter'),value('competition'),mode,value('school_id'),value('team_size')].join('|')} submitter={value('submitter')} competition={value('competition')} mode={mode} schoolId={value('school_id')} teamSize={value('team_size')}/>;
}
