'use client';
import {useFormStatus} from 'react-dom';
import {Button} from './button';
export function PendingSubmit({children,pendingLabel,className}:{children:React.ReactNode;pendingLabel:string;className?:string}){
  const {pending}=useFormStatus();
  return <Button type="submit" loading={pending} className={className}>{pending?pendingLabel:children}</Button>;
}
