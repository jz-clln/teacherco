'use client';
import { Button } from '@/components/ui/button';
export default function SectionError({ reset }: { reset: () => void }) { return <div className="tc-group space-y-4 p-5"><h1>Could not load this Section</h1><p>Check your connection and try again.</p><Button onClick={reset}>Try again</Button></div>; }
