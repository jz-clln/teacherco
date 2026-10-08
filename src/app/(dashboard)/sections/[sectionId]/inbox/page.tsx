import { sectionGradebook } from '@/features/gradebook/data';
import { GradeInbox } from '@/features/assisted-workflows/inbox';
export default async function InboxPage({params}:{params:Promise<{sectionId:string}>}){const {sectionId}=await params;return <GradeInbox book={await sectionGradebook(sectionId)}/>;}
