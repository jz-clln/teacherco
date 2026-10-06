import Link from 'next/link';
export function MappingLink({id}:{id:string}){return <Link className="tc-button tc-secondary" href={`/report-cards/templates/${id}/mapping`}>Map template</Link>;}
