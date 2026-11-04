import { EntryJourney } from '@/components/entry-journey';
export const metadata={title:'Submit your entry'};
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
 const params=await searchParams;
 const value=(key:string)=>typeof params[key]==='string'?params[key] as string:'';
 return <EntryJourney submitter={value('submitter')} competition={value('competition')} mode={value('mode')}/>;
}
