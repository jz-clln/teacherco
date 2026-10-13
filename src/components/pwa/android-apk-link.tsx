'use client';
import {useSyncExternalStore} from 'react';
import { Download } from "lucide-react";
import { androidApkUrl } from "@/lib/android/config";

const subscribe=()=>()=>{};
export function AndroidApkLink() {
  const android=useSyncExternalStore(subscribe,()=>/Android/i.test(navigator.userAgent),()=>false);
  const url = androidApkUrl(process.env.NEXT_PUBLIC_ANDROID_APK_URL);
  if (!url||!android) return null;
  return <p className="landing-small-note">
    <a href={url} className="tc-button tc-quiet inline-flex min-h-11 items-center gap-2" aria-label="Download Android APK — TeacherCo beta">
      <Download size={15} aria-hidden="true" />Download Android APK <span>(Beta)</span>
    </a>
  </p>;
}
