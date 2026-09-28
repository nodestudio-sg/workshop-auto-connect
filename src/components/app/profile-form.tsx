import { useState, type ReactNode } from "react";
import { BrandButton } from "@/components/app/workshop-ui";

export type ProfileValues = { name: string; email: string; company: string };

export const inputClass =
  "mt-2 min-h-[52px] w-full rounded-md border border-input bg-card px-4 text-base outline-none transition-colors focus:border-brand-strong";

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function isValidName(value: string): boolean {
  return value.trim().replace(/\s+/g, " ").length >= 2;
}

/**
 * Name, email and (optional) company. Used for sign-up, the one-time
 * "Tell us about you" step and editing in Account.
 */
export function ProfileFields({
  values,
  onChange,
}: {
  values: ProfileValues;
  onChange: (values: ProfileValues) => void;
}) {
  const showEmailHint = values.email.length > 3 && !isValidEmail(values.email);
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="profile-name" className="text-sm font-medium">
          Full name
        </label>
        <input
          id="profile-name"
          autoComplete="name"
          autoCapitalize="words"
          placeholder="e.g. Tan Wei Ming"
          value={values.name}
          maxLength={80}
          onChange={(event) => onChange({ ...values, name: event.target.value })}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="profile-email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="profile-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          value={values.email}
          maxLength={254}
          onChange={(event) => onChange({ ...values, email: event.target.value })}
          className={inputClass}
        />
        {showEmailHint ? (
          <p className="mt-1 text-xs text-attention">Please check the email address.</p>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">For receipts and booking updates.</p>
        )}
      </div>
      <div>
        <label htmlFor="profile-company" className="text-sm font-medium">
          Company <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <input
          id="profile-company"
          autoComplete="organization"
          placeholder="For company or fleet vehicles"
          value={values.company}
          maxLength={80}
          onChange={(event) => onChange({ ...values, company: event.target.value })}
          className={inputClass}
        />
      </div>
    </div>
  );
}

/** ProfileFields with its own state and a submit button. */
export function ProfileForm({
  initial,
  submitLabel,
  onSubmit,
  footer,
}: {
  initial: ProfileValues;
  submitLabel: string;
  onSubmit: (values: ProfileValues) => Promise<void>;
  footer?: ReactNode;
}) {
  const [values, setValues] = useState(initial);
  const [busy, setBusy] = useState(false);
  const valid = isValidName(values.name) && isValidEmail(values.email);

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (!valid || busy) return;
        setBusy(true);
        try {
          await onSubmit(values);
        } finally {
          setBusy(false);
        }
      }}
    >
      <ProfileFields values={values} onChange={setValues} />
      <BrandButton type="submit" disabled={!valid || busy} className="mt-6">
        {busy ? "Saving…" : submitLabel}
      </BrandButton>
      {footer}
    </form>
  );
}

export const PROFILE_ERRORS = {
  name: "Please enter your full name.",
  email: "Please check the email address.",
  company: "The company name is too long.",
  unavailable: "Saving your details isn't switched on yet. Please try again later.",
  failed: "We couldn't save your details just now. Please try again.",
} as const;
