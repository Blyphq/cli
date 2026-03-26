import { useState, type ReactNode } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { StudioDetectedSection, StudioMeta, StudioSectionId } from "@/lib/studio";
import { useTRPC } from "@/utils/trpc";

import { PanelHeader } from "./panel-header";

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

  const addSection = useMutation({
    ...trpc.studio.addCustomSection.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries();
        setDialogOpen(false);
        setName("");
        setIcon("✨");
        setFields("");
        setRoutes("");
        setMessages("");
      },
    }),
  });

  const detected = meta?.sections ?? [];
  const pinnedTop = [
    { id: "overview" as const, label: "Overview", icon: "●", count: null, unread: false },
  ];
  const pinnedBottom = [{ id: "all-logs" as const, label: "All Logs", icon: "📋", count: null, unread: false }];
  const errors = detected.find((item) => item.id === "errors");
  const rest = detected.filter((item) => item.id !== "errors");

  return (
    <>
      <Card size="sm">
        <PanelHeader
          title="Sections"
          description="Adaptive views based on the current session."
        />
        <CardContent className="space-y-2">
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
          {errors ? <div className="border-t border-border/60 pt-2" /> : null}
          <AnimatePresence initial={false}>
            {errors ? (
              <AnimatedSectionRow key={errors.id}>
                <SectionButton
                  active={section === errors.id}
                  icon={errors.icon}
                  label={errors.label}
                  count={errors.count}
                  unread={hasUnread(errors, visitedAtBySection)}
                  destructive
                  onClick={() => onSelect(errors.id)}
                />
              </AnimatedSectionRow>
            ) : null}
            {rest.map((item) => (
              <AnimatedSectionRow key={item.id}>
                <SectionButton
                  active={section === item.id}
                  icon={item.icon}
                  label={item.label}
                  count={item.count}
                  unread={hasUnread(item, visitedAtBySection)}
                  onClick={() => onSelect(item.id)}
                />
              </AnimatedSectionRow>
            ))}
          </AnimatePresence>
          <div className="border-t border-border/60 pt-2">
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
          </div>
          <Button variant="outline" className="w-full justify-start" onClick={() => setDialogOpen(true)}>
            <Plus />
            Add section
          </Button>
        </CardContent>
      </Card>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
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
                disabled={!name.trim()}
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
  icon: string;
  label: string;
  count?: number | null;
  unread: boolean;
  destructive?: boolean;
  onClick(): void;
}) {
  return (
    <Button
      variant={props.active ? "secondary" : "outline"}
      className="w-full justify-between"
      onClick={props.onClick}
    >
      <span className="flex items-center gap-2">
        <span>{props.icon}</span>
        <span>{props.label}</span>
        {props.unread ? <span className="size-2 rounded-full bg-destructive" aria-hidden /> : null}
      </span>
      {typeof props.count === "number" ? (
        <Badge variant={props.destructive ? "destructive" : props.active ? "default" : "muted"}>
          {props.count}
        </Badge>
      ) : null}
    </Button>
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
