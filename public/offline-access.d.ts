export function deviceCanWrite(owner:string):boolean;
export function assertDeviceWrite(owner:string):void;
export function refreshDeviceAccess(owner:string):Promise<void>;
export function watchDeviceAccess(root:HTMLElement,owner:string):void;
export const READ_ONLY:string;
