//src\components\ui\button.tsx - Jabez

import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  variant?: "primary" | "secondary" | "ghost";
};

export function Button({ className, variant = "primary", loading=false, disabled, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "tc-button",
        variant === "primary" && "tc-primary",
        variant === "secondary" && "tc-secondary",
        variant === "ghost" && "tc-quiet",
        className,
      )}
      {...props}
      disabled={disabled||loading}
      aria-busy={loading||undefined}
    >{children}</button>
  );
}
