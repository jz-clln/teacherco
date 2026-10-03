import { termsAndConditions } from "@/features/legal/content";
import { LegalDocument } from "@/features/legal/legal-document";

export const metadata = { title: "Terms & Conditions", description: termsAndConditions.description };

export default function TermsPage() {
  return <LegalDocument document={termsAndConditions} />;
}
