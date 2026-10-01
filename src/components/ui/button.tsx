import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
};

export function Button({ className, variant = "primary", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-[#1A4D2E] text-white hover:bg-[#123820]",
        variant === "secondary" && "bg-[#EAF0EA] text-[#1A4D2E] hover:bg-[#D5E0D5]",
        variant === "ghost" && "bg-transparent text-[#315F3D] hover:bg-[#EAF0EA]",
        className,
      )}
      {...props}
    />
  );
}
