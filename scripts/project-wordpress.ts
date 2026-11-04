import { db } from '../src/server/db';
import { projectWordPressSchools } from '../src/server/wordpress-projection';

const args=process.argv.slice(2),source=args.find(arg=>!arg.startsWith('--'));
if(!source||args.some(arg=>arg.startsWith('--')&&arg!=='--commit'))throw new Error('Usage: npx tsx scripts/project-wordpress.ts SOURCE_URL [--commit]');
if(process.env.MIGRATION_DATABASE_URL)process.env.DATABASE_URL=process.env.MIGRATION_DATABASE_URL;
if(!process.env.DATABASE_URL)throw new Error('Set the target DATABASE_URL privately.');
const target=new URL(process.env.DATABASE_URL);
if(args.includes('--commit')&&process.env.WORDPRESS_MIGRATION_TARGET!==target.hostname)throw new Error('Set WORDPRESS_MIGRATION_TARGET to the reviewed target hostname before committing.');
try{
 const report=await projectWordPressSchools(db,source,{commit:args.includes('--commit')});
 console.log(JSON.stringify(report)); // Aggregate counts only; never payloads or contacts.
}catch{
 console.error('WordPress school projection failed. No records from the batch were committed. Inspect the private source identities and checksums.');process.exitCode=1;
}finally{setTimeout(()=>process.exit(process.exitCode||0),50);}
