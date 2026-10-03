import type { Metadata } from "next";
import { getAccessContext } from "@/lib/auth/access-guard";
import { accessDestination } from "@/lib/auth/access-policy";
import { LandingPage } from "@/components/landing/landing-page";

const title = "TeacherCo — Your Classroom Companion";
const description = "TeacherCo helps teachers organize classroom records, check assessments, understand class data, and reduce repetitive work.";
const deploymentHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;

export const metadata: Metadata = {
  title: { absolute: title }, description,
  metadataBase: new URL(deploymentHost ? `https://${deploymentHost}` : "http://localhost:3000"),
  openGraph: {
    title, description, type: "website", siteName: "TeacherCo",
    images: [{ url: "/brand/today-visual.png", width: 1536, height: 1024, alt: "TeacherCo classroom workspace" }],
  },
  twitter: { card: "summary_large_image", title, description, images: ["/brand/today-visual.png"] },
};

export default async function HomePage() {
  // Public content remains available during an account-service outage.
  // Protected application routes continue to enforce their own access guards.
  const context = await getAccessContext().catch(() => null);
  const destination = context ? accessDestination(!!context.user.email_confirmed_at, context.profile) : null;
  return <LandingPage destination={destination} />;
}
