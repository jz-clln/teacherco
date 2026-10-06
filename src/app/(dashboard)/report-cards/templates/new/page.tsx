import Link from 'next/link';
import { TemplateUploadForm } from '@/features/report-card-templates/upload-form';
export const metadata={title:'Upload report card template'};
export default function NewTemplatePage(){return <div className="mx-auto max-w-2xl space-y-5"><Link href="/report-cards/templates" className="inline-flex min-h-11 items-center text-sm text-[#4F6F52]">Back to templates</Link><h1 className="text-2xl font-semibold">Upload report card template</h1><TemplateUploadForm/></div>;}
