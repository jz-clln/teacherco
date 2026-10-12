import { Suspense } from 'react';
import { PageLoading } from '@/components/ui/page-loading';
export default function SectionAreaTemplate({children}:{children:React.ReactNode}) {
  return <Suspense fallback={<PageLoading label="Loading Section page..."/>}>{children}</Suspense>;
}
