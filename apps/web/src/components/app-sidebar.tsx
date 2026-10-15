import * as React from "react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar"

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  children?: React.ReactNode
  project?: React.ReactNode
  footer?: React.ReactNode
}

export function AppSidebar({ children, project, footer, ...props }: AppSidebarProps) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader className="gap-4 px-3 pt-4 pb-2">
        <a href="/" className="flex items-center gap-2 px-1 outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md">
          <BlypMark />
          <span className="font-heading text-[0.95rem] font-semibold tracking-[-0.03em]">
            blyp studio
          </span>
        </a>
        {project}
      </SidebarHeader>
      <SidebarContent className="gap-0 border-t border-sidebar-border px-1 pt-2">
        {children}
      </SidebarContent>
      {footer ? <SidebarFooter className="px-3 pb-3">{footer}</SidebarFooter> : null}
    </Sidebar>
  )
}

export function BlypMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={"block size-6 shrink-0 " + (className ?? "")}
    >
      <img src="/logos/blyp-light.svg" alt="" width={24} height={24} className="size-full object-contain dark:hidden" />
      <img src="/logos/blyp-dark.svg" alt="" width={24} height={24} className="hidden size-full object-contain dark:block" />
    </span>
  )
}
