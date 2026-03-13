import {
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MutableRefObject,
} from "react";

import { Bot, X } from "lucide-react";

import { AssistantPanel } from "@/components/studio/assistant-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
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
  chatError?: Error;
  draft: string;
  messages: StudioChatMessage[];
  model: string;
  statusState: StudioChatStatus;
  canDescribeSelection: boolean;
  selectionLabel: string;
  status: StudioAssistantStatus | undefined;
  onDraftChange(value: string): void;
  onModelChange(value: string): void;
  onDescribeSelection(): void;
  onReferenceSelect(reference: StudioAssistantReference): void;
  onSend(): void;
  onQuickAction(prompt: string): void;
  onStop(): void;
  onOpenChange(next: boolean): void;
}

export function AssistantSheet({
  open,
  chatError,
  draft,
  messages,
  model,
  statusState,
  canDescribeSelection,
  selectionLabel,
  status,
  onDraftChange,
  onModelChange,
  onDescribeSelection,
  onReferenceSelect,
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
      chatError={chatError}
      draft={draft}
      messages={messages}
      model={model}
      selectionLabel={selectionLabel}
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
          className="h-dvh max-h-none max-w-none border-0 ring-0"
          initialFocus={status?.enabled ? composerRef : true}
        >
          <MobileAssistantChrome
            descriptionId={descriptionId}
            titleId={titleId}
            selectionLabel={selectionLabel}
            onClose={() => onOpenChange(false)}
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
      className="fixed inset-y-4 right-4 z-40 min-w-0 transition-[width] duration-200 ease-out"
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
          "ring-foreground/10 bg-card text-card-foreground flex h-full min-w-0 flex-col overflow-hidden border ring-1 transition-shadow duration-200",
          desktopExpanded ? "shadow-2xl" : "shadow-lg",
        )}
      >
        <AssistantChrome
          descriptionId={descriptionId}
          titleId={titleId}
          selectionLabel={selectionLabel}
          onClose={() => onOpenChange(false)}
        />
        {sharedPanel}
      </div>
    </aside>
  );
}

function AssistantChrome({
  descriptionId,
  titleId,
  selectionLabel,
  onClose,
}: {
  descriptionId: string;
  titleId: string;
  selectionLabel: string;
  onClose(): void;
}) {
  return (
    <div className="border-b border-border/60 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex min-w-0 items-center gap-2">
            <Bot className="size-4" />
            <h2 id={titleId} className="text-sm font-medium">
              Assistant
            </h2>
          </div>
          <p id={descriptionId} className="text-xs text-muted-foreground">
            Ask for patterns, causal chains, blast radius, and next debugging steps.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="default"
            className="max-w-[18rem] truncate"
            title={selectionLabel}
          >
            {selectionLabel}
          </Badge>
          <Button
            aria-label="Close assistant"
            size="icon-sm"
            variant="outline"
            onClick={onClose}
          >
            <X />
          </Button>
        </div>
      </div>
    </div>
  );
}

function MobileAssistantChrome({
  descriptionId,
  titleId,
  selectionLabel,
  onClose,
}: {
  descriptionId: string;
  titleId: string;
  selectionLabel: string;
  onClose(): void;
}) {
  return (
    <div className="border-b border-border/60 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex min-w-0 items-center gap-2">
            <Bot className="size-4" />
            <DialogTitle id={titleId}>Assistant</DialogTitle>
          </div>
          <DialogDescription id={descriptionId}>
            Ask for patterns, causal chains, blast radius, and next debugging
            steps.
          </DialogDescription>
        </div>
        <Button
          aria-label="Close assistant"
          size="icon-sm"
          variant="outline"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>
      <div className="pt-3">
        <Badge variant="default" className="max-w-full truncate" title={selectionLabel}>
          {selectionLabel}
        </Badge>
      </div>
    </div>
  );
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia(query);
    const legacyMediaQuery = mediaQuery as MediaQueryList & {
      addListener?: (listener: (event: MediaQueryListEvent) => void) => void;
      removeListener?: (listener: (event: MediaQueryListEvent) => void) => void;
    };
    const handleChange = () => setMatches(mediaQuery.matches);

    handleChange();

    if ("addEventListener" in mediaQuery) {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    legacyMediaQuery.addListener?.(handleChange);
    return () => legacyMediaQuery.removeListener?.(handleChange);
  }, [query]);

  return matches;
}

function clearCollapseTimer(timeoutRef: MutableRefObject<number | null>) {
  if (timeoutRef.current === null) {
    return;
  }

  window.clearTimeout(timeoutRef.current);
  timeoutRef.current = null;
}
