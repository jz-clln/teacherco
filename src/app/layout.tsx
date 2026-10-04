import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/components/providers/app-providers";
import { PwaStatus } from "@/components/pwa/pwa-status";
import "@/components/pwa/pwa.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-brand",
});

export const metadata: Metadata = {
  title: {
    default: "TeacherCo",
    template: "%s · TeacherCo",
  },
  description: "Your classroom companion.",
  applicationName: "TeacherCo",
  appleWebApp: { capable: true, title: "TeacherCo", statusBarStyle: "default" },
  icons: {
    icon: "/brand/teacherco-mascot.png",
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#1A4D2E",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${poppins.className} ${poppins.variable}`} suppressHydrationWarning>
        <AppProviders><PwaStatus />{children}</AppProviders>
      </body>
    </html>
  );
}
