'use client';
import {refreshDeviceAccess} from '../../../public/offline-access.js';
import {useEffect} from 'react';
import {syncRecords,prepareRecords} from '../../../public/offline-records.js';
import {syncAttendance,prepareAttendance} from '../../../public/offline-attendance.js';
export function AttendanceSync({owner}:{owner:string}){
  useEffect(()=>{
    document.cookie=`teacherco_offline_owner=${owner}; Path=/; SameSite=Strict; Max-Age=31536000${location.protocol==='https:'?'; Secure':''}`;
    const sync=()=>{void refreshDeviceAccess(owner).then(()=>syncRecords(owner)).then(()=>syncAttendance(owner)).then(()=>Promise.all([prepareAttendance(owner),prepareRecords(owner)])).catch(()=>{/* Saved device data remains available for retry. */});};
    sync();window.addEventListener('online',sync);window.addEventListener('focus',sync);
    const timer=setInterval(sync,30000);
    return()=>{clearInterval(timer);window.removeEventListener('online',sync);window.removeEventListener('focus',sync);};
  },[owner]);
  return null;
}
