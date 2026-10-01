import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/components/providers/app-providers";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "TeacherCo",
    template: "%s · TeacherCo",
  },
  description: "Your classroom companion.",
  applicationName: "TeacherCo",
};

export const viewport: Viewport = {
  themeColor: "#1A4D2E",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={poppins.className}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
