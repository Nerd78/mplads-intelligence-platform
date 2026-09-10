import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  Command,
  Cpu,
  Landmark,
  Layers,
  Map,
  Receipt,
  ShieldAlert,
  UserSquare2,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useStatsOverview } from "@/lib/hooks";
import { timeAgo } from "@/lib/mplads-data";

const NAV_GROUPS = [
  {
    label: "Command",
    items: [{ title: "Command Center", url: "/", icon: Command }],
  },
  {
    label: "Analytics",
    items: [
      { title: "National Intelligence", url: "/national-intelligence", icon: Landmark },
      { title: "State Intelligence", url: "/state-intelligence", icon: Layers },
      { title: "District Intelligence", url: "/district-intelligence", icon: Layers },
      { title: "MP Intelligence", url: "/mp-intelligence", icon: UserSquare2 },
    ],
  },
  {
    label: "Investigations",
    items: [
      { title: "Risk Queue", url: "/risk-queue", icon: ShieldAlert },
      { title: "Works", url: "/works", icon: Layers },
      { title: "Payments", url: "/payments", icon: Receipt },
    ],
  },
  {
    label: "Geospatial",
    items: [{ title: "Risk Map", url: "/risk-map", icon: Map }],
  },
  {
    label: "System",
    items: [{ title: "Model Evaluation", url: "/model-evaluation", icon: Cpu }],
  },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const currentPath = useRouterState({ select: (router) => router.location.pathname });
  const { data: overview } = useStatsOverview();

  const isActive = (path: string) => currentPath === path;

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Activity className="h-4 w-4" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-semibold leading-tight text-sidebar-foreground">MPLADS</span>
              <span className="text-[10px] leading-tight tracking-wide text-sidebar-foreground/70">INTELLIGENCE</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                      <Link to={item.url} className="flex items-center gap-2" activeProps={{ className: "font-medium" }}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border px-3 py-3">
        {!collapsed ? (
          <div className="space-y-0.5 text-[11px] text-sidebar-foreground/60">
            <p className="font-medium text-sidebar-foreground/80">Detection Engine</p>
            <p>Model {overview?.model_version ?? "-"}</p>
            <p>Last scored {timeAgo(overview?.last_scored_at)}</p>
          </div>
        ) : (
          <Map className="mx-auto h-4 w-4 text-sidebar-foreground/50" />
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
