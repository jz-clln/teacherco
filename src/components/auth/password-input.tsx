"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export function PasswordInput({
  name = "password",
  placeholder = "Enter your password",
  autoComplete = "current-password",
}: {
  name?: string;
  placeholder?: string;
  autoComplete?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative mt-1.5">
      <input
        name={name}
        type={visible ? "text" : "password"}
        required
        minLength={8}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className="w-full rounded-xl border border-[#E3E5E1] bg-white px-3.5 py-3 pr-11 text-sm outline-none transition placeholder:text-[#A0A6A1] focus:border-[#4F6F52] focus:ring-4 focus:ring-[#4F6F52]/10"
      />
      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center text-[#8B928C] transition hover:text-[#1A4D2E]"
      >
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}
