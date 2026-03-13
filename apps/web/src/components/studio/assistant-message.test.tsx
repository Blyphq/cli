// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { StudioAssistantReference, StudioChatMessage } from "@/lib/studio";

import { AssistantMessage } from "./assistant-message";

describe("AssistantMessage", () => {
  it("renders user messages as right-aligned bubbles", () => {
    const { container } = render(
      <AssistantMessage
        message={createMessage({
          id: "user-1",
          role: "user",
          text: "User message",
        })}
        onReferenceSelect={vi.fn()}
      />,
    );

    const root = screen.getByText("You").closest(".group");
    const bubble = findElementByClass(container, "max-w-[72%]");

    expect(root).toHaveClass("ml-auto");
    expect(bubble).toHaveClass("bg-secondary");
    expect(screen.getByText("User message")).toBeInTheDocument();
  });

  it("renders assistant messages as left-aligned bubbles and keeps references clickable", async () => {
    const onReferenceSelect = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <AssistantMessage
        message={createMessage({
          id: "assistant-1",
          role: "assistant",
          text: "Assistant response",
          reasoning: "Reasoning trace",
          model: "openai/gpt-5.4",
          references: [
            {
              kind: "record",
              id: "record-1",
              label: "checkout failed",
              reason: "Repeated in nearby logs",
              timestamp: "2026-03-13T10:00:00.000Z",
              fileName: "log.ndjson",
            },
          ],
        })}
        onReferenceSelect={onReferenceSelect}
      />,
    );

    const root = screen.getByText("Observability assistant").closest(".group");
    const bubble = findElementByClass(container, "max-w-[80%]");

    expect(root).not.toHaveClass("ml-auto");
    expect(bubble).toHaveClass("bg-background");
    expect(screen.getByText("openai/gpt-5.4")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /log: checkout failed/i }));
    expect(onReferenceSelect).toHaveBeenCalledWith({
      kind: "record",
      id: "record-1",
      label: "checkout failed",
      reason: "Repeated in nearby logs",
      timestamp: "2026-03-13T10:00:00.000Z",
      fileName: "log.ndjson",
    });
  });
});

function createMessage({
  id,
  role,
  text,
  reasoning,
  model,
  references,
}: {
  id: string;
  role: "user" | "assistant";
  text: string;
  reasoning?: string;
  model?: string;
  references?: StudioAssistantReference[];
}): StudioChatMessage {
  const parts: StudioChatMessage["parts"] = [{ type: "text", text }];

  if (reasoning) {
    parts.push({ type: "reasoning", text: reasoning });
  }

  return {
    id,
    role,
    parts,
    metadata: {
      model,
      references,
    },
  } as StudioChatMessage;
}

function findElementByClass(container: HTMLElement, className: string) {
  const match = Array.from(container.querySelectorAll<HTMLElement>("div")).find((element) =>
    element.className.includes(className),
  );

  expect(match).toBeTruthy();
  return match as HTMLElement;
}
