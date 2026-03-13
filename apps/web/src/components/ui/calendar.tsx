import type { ComponentProps } from "react";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        root: "w-fit",
        months: "flex flex-col gap-4",
        month: "space-y-4",
        month_caption: "relative flex items-center justify-center px-8 pt-1",
        caption_label: "text-sm font-medium",
        nav: "flex items-center gap-1",
        button_previous: cn(
          buttonVariants({ variant: "outline", size: "icon-sm" }),
          "absolute top-1 left-1 size-7 rounded-none p-0",
        ),
        button_next: cn(
          buttonVariants({ variant: "outline", size: "icon-sm" }),
          "absolute top-1 right-1 size-7 rounded-none p-0",
        ),
        month_grid: "w-full border-collapse",
        weekdays: "mb-2 flex",
        weekday: "w-9 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground",
        week: "mt-1 flex w-full",
        day: "size-9 p-0 text-center text-sm",
        day_button: cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "size-9 rounded-none p-0 text-xs font-medium aria-selected:bg-primary aria-selected:text-primary-foreground",
        ),
        selected: "bg-primary text-primary-foreground",
        today: "border border-primary/40 text-primary",
        outside: "text-muted-foreground opacity-45",
        disabled: "text-muted-foreground opacity-30",
        hidden: "invisible",
        chevron: "size-4",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: iconClassName, ...iconProps }) =>
          orientation === "left" ? (
            <ChevronLeft className={cn("size-4", iconClassName)} {...iconProps} />
          ) : (
            <ChevronRight className={cn("size-4", iconClassName)} {...iconProps} />
          ),
      }}
      {...props}
    />
  );
}

export { Calendar };
