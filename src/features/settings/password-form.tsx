// src/features/settings/password-form.tsx

"use client";

import { useActionState } from "react";
import { changePassword, type SettingsState } from "./actions";
import { FormFooter, inputClass, labelClass } from "./settings-ui";

const initialState: SettingsState = {};

export function PasswordForm() {
  const [state, formAction, pending] = useActionState(changePassword, initialState);

  return (
    <form action={formAction}>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className={labelClass}>
          New password
          <input type="password" name="password" required minLength={8} maxLength={72} autoComplete="new-password" className={inputClass} />
        </label>
        <label className={labelClass}>
          Confirm new password
          <input type="password" name="confirmPassword" required minLength={8} maxLength={72} autoComplete="new-password" className={inputClass} />
        </label>
      </div>
      <p className="mt-2 text-xs leading-5 text-[#8B928C]">Use at least 8 characters.</p>
      <FormFooter state={state} pending={pending} label="Update password" />
    </form>
  );
}