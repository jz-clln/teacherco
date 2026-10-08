import Link from 'next/link';
export function MappingLink({id}:{id:string}){return <Link className="tc-button tc-primary" href={`/report-cards/templates/${id}/analyze`}>Set up template</Link>;}
