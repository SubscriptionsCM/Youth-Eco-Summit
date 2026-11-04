import { HistoricalEntry } from '@/components/historical-entry';
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <HistoricalEntry id={id}/>;}
