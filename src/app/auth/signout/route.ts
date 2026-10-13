import {createClient} from '@/lib/supabase/server';
import {NextResponse} from 'next/server';
export async function POST(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)return new Response('Invalid origin',{status:403});
 await (await createClient()).auth.signOut();const response=NextResponse.redirect(new URL('/login',request.url),303);response.cookies.delete('teacherco_offline_owner');return response;
}
