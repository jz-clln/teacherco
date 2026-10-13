const key=owner=>`teacherco-access:${owner}`;
export const READ_ONLY='Your access has expired or needs verification. Connect and redeem an invite code to enable editing. Your saved records are safe.';
function currentOwner(){return document.cookie.split('; ').find(v=>v.startsWith('teacherco_offline_owner='))?.split('=')[1]||'';}
export function deviceCanWrite(owner){
 if(!owner||currentOwner()!==owner)return false;
 try{const access=JSON.parse(localStorage.getItem(key(owner))||'null');if(!access||access.owner!==owner||access.status!=='active'||!Number.isFinite(access.checkedAt))return false;
 const localNow=Date.now(),clientCheckedAt=access.clientCheckedAt??access.checkedAt;
 if(localNow+300000<clientCheckedAt)return false;
 const now=access.checkedAt+Math.max(0,localNow-clientCheckedAt);
 return access.expiresAt===null||Date.parse(access.expiresAt)>now;
 }catch{return false;}
}
export function assertDeviceWrite(owner){if(!deviceCanWrite(owner))throw new Error(READ_ONLY);}
let refreshing;
export function refreshDeviceAccess(owner){
 if(!navigator.onLine||!owner||currentOwner()!==owner)return Promise.resolve();
 if(refreshing)return refreshing;
 refreshing=(async()=>{try{
  const response=await fetch('/api/access',{cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(currentOwner()!==owner)return;
  if(response.status===401||response.status===403){localStorage.removeItem(key(owner));window.dispatchEvent(new Event('teacherco-access'));return;}
  if(!response.ok)return;
  const data=await response.json();if(data.owner!==owner||!['active','pending','suspended'].includes(data.status)||!Number.isFinite(data.checkedAt)||(data.expiresAt!==null&&!Number.isFinite(Date.parse(data.expiresAt))))return;
  localStorage.setItem(key(owner),JSON.stringify({...data,clientCheckedAt:Date.now()}));window.dispatchEvent(new Event('teacherco-access'));
 }catch{/* Keep the last verified deadline when disconnected. */}})().finally(()=>{refreshing=null;});return refreshing;
}
export function watchDeviceAccess(root,owner){
 const banner=document.createElement('p');banner.setAttribute('role','status');root.before(banner);
 const check=()=>{const readonly=!deviceCanWrite(owner);banner.replaceChildren();if(readonly){banner.append(document.createTextNode(READ_ONLY+' '));const link=document.createElement('a');link.href='/invite';link.textContent='Renew access';banner.append(link);}
 for(const node of root.querySelectorAll('input,textarea,select,button')){
  const write=node.tagName!=='BUTTON'||/^(save|create|edit|add|remove|archive|restore|enroll|sync now|use device|keep online|download excel|print report)/i.test(node.textContent.trim());
  if(!write)continue;if(readonly&&!node.disabled){node.disabled=true;node.dataset.accessDisabled='true';}else if(!readonly&&node.dataset.accessDisabled){node.disabled=false;delete node.dataset.accessDisabled;}
 }};
 const observer=new MutationObserver(check);observer.observe(root,{childList:true,subtree:true});check();setInterval(check,1000);window.addEventListener('teacherco-access',check);window.addEventListener('storage',check);
}
