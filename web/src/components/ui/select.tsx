import { forwardRef, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A native <select> styled to match the design system. Simpler than a
 * Radix-based listbox, but fully accessible and keyboard-operable out of
 * the box, which is what matters most here.
 */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <div className="relative inline-block">
      <select
        ref={ref}
        className={cn(
          "h-9 w-full appearance-none rounded-lg border border-input bg-card ps-8 pe-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute start-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
    </div>
  ),
);
Select.displayName = "Select";
