import {
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MutableRefObject,
} from "react";

import { useMediaQuery } from "@/hooks/use-media-query";

import { Crosshair, MessagesSquare, Plus, Sparkles, X } from "lucide-react";

import { AssistantPanel } from "@/components/studio/assistant-panel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  StudioAssistantReference,
  StudioAssistantStatus,
  StudioChatMessage,
  StudioChatStatus,
} from "@/lib/studio";
import { cn } from "@/lib/utils";

const DESKTOP_BREAKPOINT = "(min-width: 1024px)";
const DESKTOP_EXPANDED_WIDTH = "clamp(52rem, 68vw, 72rem)";
const DESKTOP_COLLAPSED_WIDTH = "clamp(24rem, 30vw, 32rem)";
const COLLAPSE_DELAY_MS = 180;

interface AssistantSheetProps {
  open: boolean;
  activeChatId: string | null;
  chatSessions: Array<{ id: string; title: string; updatedAt: string }>;
  chatError?: Error;
  draft: string;
  messages: StudioChatMessage[];
  model: string;
  statusState: StudioChatStatus;
  canDescribeSelection: boolean;
  canEdit: boolean;
  scopeLabel: string;
  status: StudioAssistantStatus | undefined;
  onCreateChat(): void;
  onDraftChange(value: string): void;
  onModelChange(value: string): void;
  onDescribeSelection(): void;
  onReferenceSelect(reference: StudioAssistantReference): void;
  onSelectChat(chatId: string): void;
  onSend(): void;
  onQuickAction(prompt: string): void;
  onStop(): void;
  onOpenChange(next: boolean): void;
}

export function AssistantSheet({
  open,
  activeChatId,
  chatSessions,
  chatError,
  draft,
  messages,
  model,
  statusState,
  canDescribeSelection,
  canEdit,
  scopeLabel,
  status,
  onCreateChat,
  onDraftChange,
  onModelChange,
  onDescribeSelection,
  onReferenceSelect,
  onSelectChat,
  onSend,
  onQuickAction,
  onStop,
  onOpenChange,
}: AssistantSheetProps) {
  const [desktopExpanded, setDesktopExpanded] = useState(true);
  const isDesktop = useMediaQuery(DESKTOP_BREAKPOINT);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const collapseTimeoutRef = useRef<number | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) {
      clearCollapseTimer(collapseTimeoutRef);
      setDesktopExpanded(true);
      return;
    }

    setDesktopExpanded(true);
  }, [open]);

  useEffect(() => {
    if (!open || !status?.enabled) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      composerRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [open, status?.enabled]);

  useEffect(() => () => clearCollapseTimer(collapseTimeoutRef), []);

  const expandDesktop = () => {
    clearCollapseTimer(collapseTimeoutRef);
    setDesktopExpanded(true);
  };

  const collapseDesktop = () => {
    clearCollapseTimer(collapseTimeoutRef);
    collapseTimeoutRef.current = window.setTimeout(() => {
      setDesktopExpanded(false);
    }, COLLAPSE_DELAY_MS);
  };

  const handleDesktopBlurCapture = (event: FocusEvent<HTMLElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }

    collapseDesktop();
  };

  const handleDesktopKeyDownCapture = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape") {
      return;
    }

    event.stopPropagation();
    onOpenChange(false);
  };

  if (!open) {
    return null;
  }

  const sharedPanel = (
    <AssistantPanel
      canDescribeSelection={canDescribeSelection}
      canEdit={canEdit}
      chatError={chatError}
      draft={draft}
      messages={messages}
      model={model}
      scopeLabel={scopeLabel}
      status={status}
      statusState={statusState}
      textareaRef={composerRef}
      onDescribeSelection={onDescribeSelection}
      onDraftChange={onDraftChange}
      onModelChange={onModelChange}
      onQuickAction={onQuickAction}
      onReferenceSelect={onReferenceSelect}
      onSend={onSend}
      onStop={onStop}
    />
  );

  if (!isDesktop) {
    return (
      <Dialog open={open} onOpenChange={(next) => onOpenChange(next)}>
        <DialogContent
          aria-describedby={descriptionId}
          aria-labelledby={titleId}
          className="flex h-dvh max-h-none max-w-none flex-col border-0 bg-card ring-0"
          initialFocus={status?.enabled ? composerRef : true}
        >
          <MobileAssistantChrome
            descriptionId={descriptionId}
            titleId={titleId}
            scopeLabel={scopeLabel}
            onClose={() => onOpenChange(false)}
          />
          <AssistantChatSwitcher
            activeChatId={activeChatId}
            chatSessions={chatSessions}
            onCreateChat={onCreateChat}
            onSelectChat={onSelectChat}
          />
          {sharedPanel}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <aside
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      aria-modal="false"
      data-expanded={desktopExpanded ? "true" : "false"}
      data-testid="assistant-sheet"
      role="complementary"
      className="fixed inset-y-4 right-4 z-40 min-w-0 transition-[width] duration-200 ease-out-expo"
      onBlurCapture={handleDesktopBlurCapture}
      onFocusCapture={expandDesktop}
      onKeyDownCapture={handleDesktopKeyDownCapture}
      onMouseEnter={expandDesktop}
      onMouseLeave={collapseDesktop}
      style={{
        width: desktopExpanded ? DESKTOP_EXPANDED_WIDTH : DESKTOP_COLLAPSED_WIDTH,
      }}
    >
      <div
        className={cn(
          "flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-border-strong bg-card text-card-foreground transition-shadow duration-200 ease-out-expo",
          desktopExpanded ? "shadow-stage" : "shadow-lg",
        )}
      >
        <AssistantChrome
          descriptionId={descriptionId}
          titleId={titleId}
          scopeLabel={scopeLabel}
          onClose={() => onOpenChange(false)}
        />
        <AssistantChatSwitcher
          activeChatId={activeChatId}
          chatSessions={chatSessions}
          onCreateChat={onCreateChat}
          onSelectChat={onSelectChat}
        />
        {sharedPanel}
      </div>
    </aside>
  );
}

function AssistantMark() {
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary-soft text-primary-soft-foreground">
      <Sparkles className="size-3.5" />
    </span>
  );
}

const ASSISTANT_DESCRIPTION =
  "Ask for patterns, causal chains, blast radius, and next debugging steps.";

function AssistantChrome({
  descriptionId,
  titleId,
  scopeLabel,
  onClose,
}: {
  descriptionId: string;
  titleId: string;
  scopeLabel: string;
  onClose(): void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 border-b border-border px-4 py-3">
      <AssistantMark />
      <div className="min-w-0 flex-1">
        <h2
          id={titleId}
          className="font-heading text-[0.9rem] font-semibold leading-tight tracking-[-0.02em]"
        >
          Blyp AI
        </h2>
        <p id={descriptionId} className="truncate text-[0.72rem] text-muted-foreground">
          {ASSISTANT_DESCRIPTION}
        </p>
      </div>
      <ScopeChip scopeLabel={scopeLabel} className="max-w-[18rem]" />
      <Button aria-label="Close assistant" size="icon-sm" variant="ghost" onClick={onClose}>
        <X />
      </Button>
    </div>
  );
}

function ScopeChip({ scopeLabel, className }: { scopeLabel: string; className?: string }) {
  return (
    <span
      title={scopeLabel}
      className={cn(
        "inline-flex h-6 min-w-0 shrink items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 text-[0.7rem] text-muted-foreground",
        className,
      )}
    >
      <Crosshair className="size-3 shrink-0" aria-hidden />
      <span className="truncate font-mono text-foreground/85">{scopeLabel}</span>
    </span>
  );
}

function AssistantChatSwitcher({
  activeChatId,
  chatSessions,
  onCreateChat,
  onSelectChat,
}: {
  activeChatId: string | null;
  chatSessions: Array<{ id: string; title: string; updatedAt: string }>;
  onCreateChat(): void;
  onSelectChat(chatId: string): void;
}) {
  const chatItems = chatSessions.map((chat) => ({
    value: chat.id,
    label: chat.title,
  }));

  return (
    <div className="flex min-w-0 items-center gap-2 border-b border-border bg-muted/30 px-4 py-2">
      <MessagesSquare className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <Select
          items={chatItems}
          value={activeChatId ?? undefined}
          onValueChange={(value) => {
            if (value) {
              onSelectChat(String(value));
            }
          }}
        >
          <SelectTrigger
            aria-label="Choose chat"
            className="h-7 border-transparent bg-transparent px-2 shadow-none hover:border-border-strong hover:bg-card"
          >
            <SelectValue placeholder="Choose chat" />
          </SelectTrigger>
          <SelectContent>
            {chatSessions.map((chat) => (
              <SelectItem key={chat.id} value={chat.id}>
                {chat.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button variant="outline" size="xs" onClick={onCreateChat}>
        <Plus />
        New chat
      </Button>
    </div>
  );
}

function MobileAssistantChrome({
  descriptionId,
  titleId,
  scopeLabel,
  onClose,
}: {
  descriptionId: string;
  titleId: string;
  scopeLabel: string;
  onClose(): void;
}) {
  return (
    <div className="space-y-2.5 border-b border-border px-4 py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <AssistantMark />
        <div className="min-w-0 flex-1">
          <DialogTitle
            id={titleId}
            className="font-heading text-[0.9rem] font-semibold leading-tight tracking-[-0.02em]"
          >
            Blyp AI
          </DialogTitle>
          <DialogDescription id={descriptionId} className="text-[0.72rem] text-muted-foreground">
            {ASSISTANT_DESCRIPTION}
          </DialogDescription>
        </div>
        <Button aria-label="Close assistant" size="icon-sm" variant="ghost" onClick={onClose}>
          <X />
        </Button>
      </div>
      <ScopeChip scopeLabel={scopeLabel} className="max-w-full" />
    </div>
  );
}

function clearCollapseTimer(timeoutRef: MutableRefObject<number | null>) {
  if (timeoutRef.current === null) {
    return;
  }

  window.clearTimeout(timeoutRef.current);
  timeoutRef.current = null;
}
