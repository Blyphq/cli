// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AuthView } from "./auth-view";
import { OverviewView } from "./overview-view";
import { SectionNavPanel } from "./section-nav-panel";
import { StudioToolbar } from "./studio-toolbar";

const authData = {
  stats: {
    loginAttemptsTotal: 4,
    loginSuccessCount: 2,
    loginFailureCount: 2,
    activeSessionCount: 3,
    authErrorCount: 2,
    suspiciousActivityCount: 1,
  },
  timeline: [
    {
      id: "auth:1",
      recordId: "record-1",
      timestamp: "2026-03-13T10:00:00.000Z",
      kind: "login",
      action: "login",
      outcome: "failure",
      userId: "user-1",
      userEmail: "user-1@example.com",
      ip: "10.0.0.1",
      route: "/auth/login",
      method: "POST",
      provider: null,
      scope: null,
      requiredPermission: null,
      statusCode: 401,
      durationMs: 20,
      sessionId: "session-1",
      summary: "login failure - user-1",
    },
  ],
  totalTimelineEvents: 1,
  suspiciousPatterns: [
    {
      id: "pattern-1",
      kind: "brute-force",
      title: "Brute force indicator from 10.0.0.1",
      description: "3 failed login attempts within 5 minutes.",
      affectedUserId: "user-1",
      affectedIp: "10.0.0.1",
      eventCount: 3,
      timestampStart: "2026-03-13T10:00:00.000Z",
      timestampEnd: "2026-03-13T10:04:00.000Z",
      recordIds: ["record-1"],
    },
  ],
  users: [
    {
      userId: "user-1",
      loginCount: 2,
      lastSeen: "2026-03-13T10:00:00.000Z",
      errorCount: 1,
    },
  ],
} as const;

describe("SectionNavPanel", () => {
  it("shows Auth only when meta exposes the section", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { rerender } = render(
      <SectionNavPanel
        projectPath="/project"
        meta={{
          project: {} as never,
          config: {} as never,
          sections: [],
          logs: {} as never,
        }}
        section="overview"
        visitedAtBySection={{}}
        onSelect={onSelect}
      />,
    );

    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.queryByText("Auth")).not.toBeInTheDocument();

    rerender(
      <SectionNavPanel
        projectPath="/project"
        meta={{
          project: {} as never,
          config: {} as never,
          sections: [
            {
              id: "auth",
              label: "Auth",
              count: 2,
              icon: "🔐",
              kind: "builtin",
              highlighted: false,
              unreadErrorCount: 0,
              lastMatchedAt: null,
              lastErrorAt: null,
            },
          ],
          logs: {} as never,
        }}
        section="overview"
        visitedAtBySection={{}}
        onSelect={onSelect}
      />,
    );

    await user.click(screen.getByRole("button", { name: /auth/i }));
    expect(screen.getByText("Auth")).toBeInTheDocument();
    expect(onSelect).toHaveBeenCalledWith("auth");
  });

  it("shows Background Jobs when meta exposes the section", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <SectionNavPanel
        projectPath="/project"
        meta={{
          project: {} as never,
          config: {} as never,
          sections: [
            {
              id: "background",
              label: "Background Jobs",
              count: 3,
              icon: "⚙",
              kind: "builtin",
              highlighted: false,
              unreadErrorCount: 1,
              lastMatchedAt: "2026-03-13T10:00:00.000Z",
              lastErrorAt: "2026-03-13T10:00:00.000Z",
            },
          ],
          logs: {} as never,
        }}
        section="overview"
        visitedAtBySection={{}}
        onSelect={onSelect}
      />,
    );

    await user.click(screen.getByRole("button", { name: /background jobs/i }));
    expect(onSelect).toHaveBeenCalledWith("background");
  });

  it("resets the add-section form when the dialog closes", async () => {
    const user = userEvent.setup();
    render(
      <SectionNavPanel
        projectPath="/project"
        meta={{
          project: {} as never,
          config: {} as never,
          sections: [],
          logs: {} as never,
        }}
        section="overview"
        visitedAtBySection={{}}
        onSelect={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /add section/i }));
    const nameInput = screen.getByPlaceholderText("Section name");
    await user.type(nameInput, "KYC");
    expect(nameInput).toHaveValue("KYC");

    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: /add section/i }));
    expect(screen.getByPlaceholderText("Section name")).toHaveValue("");
  });
});

describe("AuthView", () => {
  it("supports user filtering, suspicious pattern selection, and timeline selection", async () => {
    const user = userEvent.setup();
    const onSelectUser = vi.fn();
    const onResetUser = vi.fn();
    const onSelectPattern = vi.fn();
    const onSelectRecord = vi.fn();

    render(
      <AuthView
        auth={authData as never}
        loading={false}
        offset={0}
        limit={100}
        selectedRecordId={null}
        selectedUserId={null}
        selectedPatternId={null}
        onPageChange={vi.fn()}
        onSelectRecord={onSelectRecord}
        onSelectUser={onSelectUser}
        onResetUser={onResetUser}
        onSelectPattern={onSelectPattern}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^user-1$/i }));
    expect(onSelectUser).toHaveBeenCalledWith("user-1");

    await user.click(screen.getByRole("button", { name: /brute force indicator/i }));
    expect(onSelectPattern).toHaveBeenCalledWith(
      expect.objectContaining({ id: "pattern-1" }),
    );

    await user.click(screen.getByRole("button", { name: /login failure - user-1/i }));
    expect(onSelectRecord).toHaveBeenCalledWith("record-1");
  });

  it("shows the auth empty state when no events match", () => {
    render(
      <AuthView
        auth={{
          ...authData,
          timeline: [],
          totalTimelineEvents: 0,
          suspiciousPatterns: [],
          users: [],
        } as never}
        loading={false}
        offset={0}
        limit={100}
        selectedRecordId={null}
        selectedUserId={null}
        selectedPatternId={null}
        onPageChange={vi.fn()}
        onSelectRecord={vi.fn()}
        onSelectUser={vi.fn()}
        onResetUser={vi.fn()}
        onSelectPattern={vi.fn()}
      />,
    );

    expect(
      screen.getByText("No auth activity matched the current filters."),
    ).toBeInTheDocument();
  });

  it("disables auth pagination controls while loading", () => {
    render(
      <AuthView
        auth={authData as never}
        loading={true}
        offset={0}
        limit={100}
        selectedRecordId={null}
        selectedUserId={null}
        selectedPatternId={null}
        onPageChange={vi.fn()}
        onSelectRecord={vi.fn()}
        onSelectUser={vi.fn()}
        onResetUser={vi.fn()}
        onSelectPattern={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /previous/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
  });
});

describe("StudioToolbar", () => {
  it("shows overview-specific disabled helper text", () => {
    render(
      <StudioToolbar
        draftProjectPath=""
        facets={undefined}
        files={[]}
        filters={{
          level: "",
          type: "",
          search: "",
          fileId: "",
          from: "",
          to: "",
        }}
        grouping="grouped"
        meta={undefined}
        section="overview"
        onDraftProjectPathChange={vi.fn()}
        onFilterChange={vi.fn()}
        onGroupingChange={vi.fn()}
        onInspect={vi.fn()}
        onStartStandaloneChat={vi.fn()}
        onResetFilters={vi.fn()}
      />,
    );

    expect(screen.getByDisplayValue("Overview doesn't filter by level")).toBeDisabled();
    expect(screen.getByDisplayValue("Overview doesn't filter by type")).toBeDisabled();
    expect(screen.getByDisplayValue("Overview has no log grouping")).toBeDisabled();
  });

  it("shows background-job-specific disabled helper text", () => {
    render(
      <StudioToolbar
        draftProjectPath=""
        facets={undefined}
        files={[]}
        filters={{
          level: "",
          type: "",
          search: "",
          fileId: "",
          from: "",
          to: "",
        }}
        grouping="grouped"
        meta={undefined}
        section="background"
        onDraftProjectPathChange={vi.fn()}
        onFilterChange={vi.fn()}
        onGroupingChange={vi.fn()}
        onInspect={vi.fn()}
        onStartStandaloneChat={vi.fn()}
        onResetFilters={vi.fn()}
      />,
    );

    expect(screen.getByDisplayValue("Background Jobs uses run analysis")).toBeDisabled();
    expect(screen.getByDisplayValue("Background Jobs doesn't filter by type")).toBeDisabled();
    expect(screen.getByDisplayValue("Background Jobs has no log grouping")).toBeDisabled();
  });
});

describe("OverviewView", () => {
  it("formats latest signal timestamps for display", () => {
    render(
      <OverviewView
        sections={[
          {
            id: "auth",
            label: "Auth",
            count: 2,
            icon: "🔐",
            kind: "builtin",
            highlighted: false,
            unreadErrorCount: 0,
            lastMatchedAt: "2026-03-13T10:00:00.000Z",
            lastErrorAt: null,
          },
        ]}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.queryByText("Latest signal: 2026-03-13T10:00:00.000Z")).not.toBeInTheDocument();
    expect(screen.getByText(/Latest signal:/)).toBeInTheDocument();
  });
});
