'use client';
import { Button } from '@/components/ui/button';
export default function ErrorPage({reset}:{reset:()=>void}){return <div role="alert" className="tc-group space-y-3 p-6"><h1 className="font-semibold">Templates are temporarily unavailable</h1><p className="text-sm">Please check your connection and try again.</p><Button onClick={reset}>Try again</Button></div>;}
