import * as React from "react";

import { cn } from "@/lib/utils";

interface TabsContextValue {
  value: string;
}

const TabsContext = React.createContext<TabsContextValue | null>(null);

function Tabs({
  children,
  className,
  value,
  ...props
}: React.ComponentProps<"div"> & { value: string }) {
  return (
    <TabsContext.Provider value={{ value }}>
      <div
        data-slot="tabs"
        className={cn("min-w-0", className)}
        {...props}
      >
        {children}
      </div>
    </TabsContext.Provider>
  );
}

function TabsList({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="tabs-list"
      className={cn(
        "inline-flex h-8 min-w-0 items-center gap-1 border border-border bg-muted/50 p-1 text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  value,
  active,
  ...props
}: React.ComponentProps<"button"> & { value: string; active?: boolean }) {
  const context = React.useContext(TabsContext);
  const selected = active ?? context?.value === value;

  return (
    <button
      type="button"
      data-slot="tabs-trigger"
      data-state={selected ? "active" : "inactive"}
      className={cn(
        "inline-flex min-w-0 items-center justify-center whitespace-nowrap px-2.5 py-1 text-xs font-medium transition-colors outline-none",
        "data-[state=active]:bg-background data-[state=active]:text-foreground",
        "data-[state=inactive]:text-muted-foreground hover:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({
  children,
  className,
  value,
  ...props
}: React.ComponentProps<"div"> & { value: string }) {
  const context = React.useContext(TabsContext);

  if (context?.value !== value) {
    return null;
  }

  return (
    <div
      data-slot="tabs-content"
      className={cn("min-w-0", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
