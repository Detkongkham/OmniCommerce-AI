"use client";

import { cn } from "@oca/ui";
import { useEffect, useRef } from "react";

/**
 * Always-rendered role="alert" region (assistive tech announces what is put into it). Whenever a
 * new non-empty `messages` array arrives it takes focus, so a failed submit lands the user on the problem.
 */
export function ProblemAlert({ messages, className }: { messages: string[]; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (messages.length > 0) ref.current?.focus();
  }, [messages]);
  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className={cn(
        "rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-danger/40",
        messages.length === 0 && "hidden",
        className,
      )}
    >
      {messages.length === 1 ? (
        <p>{messages[0]}</p>
      ) : messages.length > 1 ? (
        <ul className="list-inside list-disc">
          {messages.map((line, index) => (
            <li key={`${index}-${line}`}>{line}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
