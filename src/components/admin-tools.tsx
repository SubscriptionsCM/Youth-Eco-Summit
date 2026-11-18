import Link from 'next/link';

const tools=[
 {href:'/admin/jobs',title:'Background tasks',description:'Check file verification and processing tasks. Retry a failed task after resolving its cause.'},
 {href:'/admin/audit',title:'Activity log',description:'Review recorded staff actions and changes to website records.'},
 {href:'/admin/trash',title:'Trash',description:'Inspect removed records and restore them when needed. Permanent deletion remains owner-only.'}
];

export function AdminTools(){
 return <><section className="portal-section"><div className="portal-task-grid">{tools.map(tool=><Link className="portal-task" href={tool.href} key={tool.href}><h2>{tool.title}</h2><p>{tool.description}</p><span className="portal-task-link">Open {tool.title.toLowerCase()}</span></Link>)}</div></section><section className="panel"><h2>Find submitted files</h2><p>Files stay with their submissions so you can see the correct entry and original submission details before downloading.</p><div className="actions"><Link href="/admin/reference-forms">Website submissions and files</Link><Link href="/admin/wordpress-history">WordPress submissions and files</Link></div></section></>;
}
