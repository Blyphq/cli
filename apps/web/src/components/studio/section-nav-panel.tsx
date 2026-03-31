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
  SidebarMenuBadge,
  SidebarMenuButton,
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
        await queryClient.invalidateQueries();
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
      <SidebarGroup>
        <SidebarGroupLabel>Sections</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
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
                    icon={getSectionIcon(item.id)}
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
              <SidebarMenuButton onClick={() => setDialogOpen(true)}>
                <Plus />
                <span>Add section</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <SidebarGroup>
        <SidebarGroupLabel>Workspace</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem className="group/section-item">
              <SidebarMenuButton
                isActive={section === "project-config"}
                onClick={() => onSelect("project-config")}
                className="transition-colors duration-150"
              >
                <Settings2 />
                <span>Project Config</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="max-w-xl p-0">
          <div className="border-b border-border/60 px-4 py-4">
            <DialogTitle>Add custom section</DialogTitle>
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
    <SidebarMenuItem className="group/section-item">
      <SidebarMenuButton
        isActive={props.active}
        onClick={props.onClick}
        className={cn(
          "transition-colors duration-150",
          !props.active ? "hover:bg-primary/20 hover:text-sidebar-accent-foreground" : "!bg-primary/70"
        )}
      >
        <span className="shrink-0 [&>svg]:size-4">{props.icon}</span>
        <span>{props.label}</span>
        {props.unread ? (
          <span className="ml-1 size-2 rounded-full bg-destructive" aria-hidden />
        ) : null}
      </SidebarMenuButton>
      {typeof props.count === "number" ? (
        <SidebarMenuBadge
          className={cn(
            "transition-colors duration-150 group-hover/section-item:text-sidebar-accent-foreground",
            props.destructive && "text-destructive group-hover/section-item:text-destructive",
            props.active && !props.destructive && "text-sidebar-accent-foreground",
          )}
        >
          {props.count}
        </SidebarMenuBadge>
      ) : null}
    </SidebarMenuItem>
  );
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

function getSectionIcon(sectionId: string): ReactNode {
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
    default:
      return <Circle />;
  }
}
