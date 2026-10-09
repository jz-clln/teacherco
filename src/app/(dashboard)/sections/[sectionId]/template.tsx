import { Suspense } from 'react';
import { LoadingState } from '@/components/ui/loading-state';
export default function SectionAreaTemplate({children}:{children:React.ReactNode}) {
  return <Suspense fallback={<LoadingState page label="Loading Section page..."/>}>{children}</Suspense>;
}
