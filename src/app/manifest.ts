import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TeacherCo",
    short_name: "TeacherCo",
    // Preserve the identity implied by the original /today start URL.
    id: "/today",
    description: "TeacherCo helps teachers organize classroom records, check assessments, understand class data, and reduce repetitive work.",
    start_url: "/today",
    scope: "/",
    categories: ["education", "productivity"],
    display: "standalone",
    background_color: "#F5EFE6",
    theme_color: "#1A4D2E",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
