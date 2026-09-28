import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "flex h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm",
      "placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20",
      "disabled:opacity-50",
      className
    )}
    {...props}
  />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-[80px] w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm",
      "placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20",
      className
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
