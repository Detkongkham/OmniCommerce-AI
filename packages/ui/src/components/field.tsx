import type { ReactNode } from "react";
import { cn } from "../lib/utils";

export interface FieldProps {
  label: string;
  htmlFor: string;
  required?: boolean;
  error?: string;
  className?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, required = false, error, className, children }: FieldProps) {
  return (
    <div className={className}>
      <label
        htmlFor={htmlFor}
        className={cn(
          "mb-1 block text-xs font-semibold text-ink-secondary",
          required && "after:ml-0.5 after:text-danger after:content-['*']",
        )}
      >
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
