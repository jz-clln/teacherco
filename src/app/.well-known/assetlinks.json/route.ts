import { androidAssetLinks } from "@/lib/android/config";

export const dynamic = "force-dynamic";

export function GET() {
  // An empty declaration grants no trust until a real signing fingerprint is
  // configured. Never publish a placeholder or automatically trust debug keys.
  return Response.json(androidAssetLinks(process.env.ANDROID_SHA256_CERT_FINGERPRINTS), {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
