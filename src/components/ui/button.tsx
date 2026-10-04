//src\components\ui\button.tsx - Jabez

import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
};

export function Button({ className, variant = "primary", ...props }: ButtonProps) {
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
    />
  );
}
