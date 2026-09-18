"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { LucideIcon } from "lucide-react";

interface Tab {
  value: string;
  label: string;
  icon?: LucideIcon;
  badge?: ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

/** Horizontal tab bar for switching between views without navigation. */
function Tabs({ tabs, value, onChange, className }: TabsProps) {
  return (
    <div
      role="tablist"
      className={cn("flex gap-1 overflow-x-auto border-b border-[hsl(var(--border))]", className)}
    >
      {tabs.map((tab) => {
        const isActive = tab.value === value;
        return (
          <button
            key={tab.value}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.value)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "border-[hsl(var(--primary))] text-[hsl(var(--foreground))]"
                : "border-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            )}
          >
            {tab.icon && <tab.icon className="h-4 w-4" />}
            {tab.label}
            {tab.badge}
          </button>
        );
      })}
    </div>
  );
}

export { Tabs, type Tab, type TabsProps };
