import { db } from '../src/server/db';
const content=[['about','About Youth Eco Summit','Approved programme information will be published here.'],['privacy','Privacy information','Approved privacy information is required before registration can open.'],['terms','Participation terms','Approved participation terms are required before registration can open.'],['contact','Contact and support','Organizer support contact information has not yet been configured.']];
for(const [key,title,body] of content)await db.query('INSERT INTO site_content(key,title,body,approved) VALUES($1,$2,$3,false) ON CONFLICT(key) DO NOTHING',[key,title,body]);
console.log('Created unapproved content drafts. No fabricated competitions, dates, consent or public claims were seeded.');process.exit(0);
