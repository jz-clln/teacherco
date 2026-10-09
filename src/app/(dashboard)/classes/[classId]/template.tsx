import { Suspense } from "react";
import ClassAreaLoading from "./loading";

// Templates remount between child routes, so returning to a class tab also
// shows its loading state instead of retaining the previous tab's content.
export default function ClassAreaTemplate({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<ClassAreaLoading />}>{children}</Suspense>;
}
