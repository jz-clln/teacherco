import { Download } from "lucide-react";
import { androidApkUrl } from "@/lib/android/config";

export function AndroidApkLink() {
  const url = androidApkUrl(process.env.NEXT_PUBLIC_ANDROID_APK_URL);
  if (!url) return null;
  return <p className="landing-small-note">
    <a href={url} className="tc-button tc-quiet inline-flex min-h-11 items-center gap-2" aria-label="Download Android APK — TeacherCo beta">
      <Download size={15} aria-hidden="true" />Download Android APK <span>(Beta)</span>
    </a>
  </p>;
}
