import { useState, type ReactNode } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bot,
  Circle,
  CreditCard,
  Database,
  Globe,
  LayoutDashboard,
  Logs,
  Plus,
  Settings2,
  Shield,
  Timer,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import type { StudioDetectedSection, StudioMeta, StudioSectionId } from "@/lib/studio";
import { useTRPC } from "@/utils/trpc";

interface SectionNavPanelProps {
  projectPath: string;
  meta: StudioMeta | undefined;
  section: StudioSectionId;
  visitedAtBySection: Record<string, string>;
  onSelect(section: StudioSectionId): void;
}

export function SectionNavPanel({
  projectPath,
  meta,
  section,
  visitedAtBySection,
  onSelect,
}: SectionNavPanelProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("✨");
  const [fields, setFields] = useState("");
  const [routes, setRoutes] = useState("");
  const [messages, setMessages] = useState("");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const resetForm = () => {
    setName("");
    setIcon("✨");
    setFields("");
    setRoutes("");
    setMessages("");
  };
  const handleDialogOpenChange = (nextOpen: boolean) => {
    setDialogOpen(nextOpen);
    if (!nextOpen) {
      resetForm();
    }
  };

  const addSection = useMutation({
    ...trpc.studio.addCustomSection.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(
          trpc.studio.meta.queryFilter({ projectPath }),
        );
        handleDialogOpenChange(false);
      },
    }),
  });

  const detected = meta?.sections ?? [];
  const pinnedTop = [
    {
      id: "overview" as const,
      label: "Overview",
      icon: getSectionIcon("overview"),
      count: null,
      unread: false,
    },
  ];
  const pinnedBottom = [
    {
      id: "all-logs" as const,
      label: "All Logs",
      icon: getSectionIcon("all-logs"),
      count: null,
      unread: false,
    },
  ];
  const errors = detected.find((item) => item.id === "errors");
  const rest = detected.filter((item) => item.id !== "errors");

  return (
    <>
      <SidebarGroup className="py-1">
        <SidebarGroupLabel className="h-6 px-2 text-[0.68rem] font-medium text-muted-foreground">
          Sections
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu className="gap-0.5">
            {pinnedTop.map((item) => (
              <SectionButton
                key={item.id}
                active={section === item.id}
                icon={item.icon}
                label={item.label}
                unread={false}
                onClick={() => onSelect(item.id)}
              />
            ))}
            {errors ? (
              <AnimatePresence initial={false}>
                <AnimatedSectionRow key={errors.id}>
                  <SectionButton
                    active={section === errors.id}
                    icon={getSectionIcon(errors.id)}
                    label={errors.label}
                    count={errors.count}
                    unread={hasUnread(errors, visitedAtBySection)}
                    destructive
                    onClick={() => onSelect(errors.id)}
                  />
                </AnimatedSectionRow>
              </AnimatePresence>
            ) : null}
            <AnimatePresence initial={false}>
              {rest.map((item) => (
                <AnimatedSectionRow key={item.id}>
                  <SectionButton
                    active={section === item.id}
                    icon={getSectionIcon(item.id, item.kind === "custom" ? item.icon : undefined)}
                    label={item.label}
                    count={item.count}
                    unread={hasUnread(item, visitedAtBySection)}
                    onClick={() => onSelect(item.id)}
                  />
                </AnimatedSectionRow>
              ))}
            </AnimatePresence>
            {pinnedBottom.map((item) => (
              <SectionButton
                key={item.id}
                active={section === item.id}
                icon={item.icon}
                label={item.label}
                unread={false}
                onClick={() => onSelect(item.id)}
              />
            ))}
            <SidebarMenuItem>
              <button
                type="button"
                onClick={() => setDialogOpen(true)}
                className={cn(navButtonClass, "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground")}
              >
                <Plus className="size-4 shrink-0" />
                <span>Add section</span>
              </button>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <SidebarGroup className="py-1">
        <SidebarGroupLabel className="h-6 px-2 text-[0.68rem] font-medium text-muted-foreground">
          Workspace
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu className="gap-0.5">
            <SectionButton
              active={section === "project-config"}
              icon={<Settings2 />}
              label="Project Config"
              unread={false}
              onClick={() => onSelect("project-config")}
            />
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="max-w-xl gap-0 p-0">
          <div className="space-y-1 border-b border-border px-4 py-4">
            <div className="blyp-eyebrow">Custom section</div>
            <DialogTitle className="font-heading text-base font-semibold tracking-[-0.02em]">Add custom section</DialogTitle>
            <DialogDescription>
              Define field, route, and message rules. The section appears only when matching logs exist.
            </DialogDescription>
          </div>
          <div className="space-y-3 p-4">
            <Input value={name} onChange={(event) => setName(event.currentTarget.value)} placeholder="Section name" />
            <Input value={icon} onChange={(event) => setIcon(event.currentTarget.value)} placeholder="Icon" />
            <Input value={fields} onChange={(event) => setFields(event.currentTarget.value)} placeholder="Field rules, comma separated" />
            <Input value={routes} onChange={(event) => setRoutes(event.currentTarget.value)} placeholder="Route rules, comma separated" />
            <Input value={messages} onChange={(event) => setMessages(event.currentTarget.value)} placeholder="Message rules, comma separated" />
            <div className="flex justify-end">
              <Button
                onClick={() =>
                  addSection.mutate({
                    projectPath,
                    name,
                    icon,
                    match: {
                      fields: splitCommaSeparated(fields),
                      routes: splitCommaSeparated(routes),
                      messages: splitCommaSeparated(messages),
                    },
                  })
                }
                disabled={!name.trim() || addSection.isPending}
              >
                Save section
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

const navButtonClass =
  "group/nav relative flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-[0.8rem] outline-none transition-colors duration-150 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring/50";

function SectionButton(props: {
  active: boolean;
  icon: ReactNode;
  label: string;
  count?: number | null;
  unread: boolean;
  destructive?: boolean;
  onClick(): void;
}) {
  return (
    <SidebarMenuItem>
      <button
        type="button"
        aria-current={props.active ? "page" : undefined}
        data-active={props.active || undefined}
        onClick={props.onClick}
        className={cn(
          navButtonClass,
          props.active
            ? "text-primary-soft-foreground"
            : "text-foreground/80 hover:bg-sidebar-accent hover:text-foreground",
        )}
      >
        {props.active ? (
          <motion.span
            layoutId="studio-nav-active"
            className="absolute inset-0 rounded-md bg-primary-soft"
            transition={{ type: "spring", stiffness: 520, damping: 40 }}
          />
        ) : null}
        <span
          className={cn(
            "relative shrink-0 [&>svg]:size-4",
            !props.active && "text-muted-foreground group-hover/nav:text-foreground",
          )}
        >
          {props.icon}
        </span>
        <span className="relative min-w-0 truncate">{props.label}</span>
        {props.unread ? (
          <span
            className="blyp-live-dot relative size-1.5 shrink-0 rounded-full bg-level-error"
            aria-label="New errors"
          />
        ) : null}
        {typeof props.count === "number" ? (
          <span
            className={cn(
              "relative ml-auto font-mono text-[0.68rem] tabular-nums",
              props.destructive && props.count > 0
                ? "text-level-error"
                : props.active
                  ? "text-primary-soft-foreground/80"
                  : "text-muted-foreground",
            )}
          >
            {formatNavCount(props.count)}
          </span>
        ) : null}
      </button>
    </SidebarMenuItem>
  );
}

function formatNavCount(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  return String(value);
}

function AnimatedSectionRow({ children }: { children: ReactNode }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.16 }}
    >
      {children}
    </motion.div>
  );
}

function splitCommaSeparated(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function hasUnread(
  section: StudioDetectedSection,
  visitedAtBySection: Record<string, string>,
): boolean {
  if (!section.lastErrorAt) {
    return false;
  }

  const visitedAt = visitedAtBySection[section.id];
  if (!visitedAt) {
    return section.unreadErrorCount > 0;
  }

  return Date.parse(section.lastErrorAt) > Date.parse(visitedAt);
}

function getSectionIcon(sectionId: string, customIcon?: string): ReactNode {
  if (customIcon) {
    return <span className="grid size-4 place-items-center text-[0.8rem] leading-none">{customIcon}</span>;
  }

  switch (sectionId) {
    case "overview":
      return <LayoutDashboard />;
    case "all-logs":
      return <Logs />;
    case "errors":
      return <AlertTriangle />;
    case "http":
      return <Globe />;
    case "agents":
      return <Bot />;
    case "auth":
      return <Shield />;
    case "payments":
      return <CreditCard />;
    case "database":
      return <Database />;
    case "background":
      return <Timer />;
    default:
      return <Circle />;
  }
}
