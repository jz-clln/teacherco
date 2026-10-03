import { privacyNotice } from "@/features/legal/content";
import { LegalDocument } from "@/features/legal/legal-document";

export const metadata = { title: "Privacy Notice", description: privacyNotice.description };

export default function PrivacyPage() {
  return <LegalDocument document={privacyNotice} />;
}
