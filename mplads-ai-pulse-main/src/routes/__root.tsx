import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import { CommandPalette } from "@/components/mplads/CommandPalette";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-blue-800"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-blue-800"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "MPLADS Intelligence - anomaly detection for MP fund works" },
      { name: "description", content: "AI-powered anomaly detection and investigation platform for the MPLADS scheme." },
      { name: "author", content: "MPLADS Intelligence Platform" },
      { name: "theme-color", content: "#2A5FC4" },
      { property: "og:title", content: "MPLADS Intelligence Platform" },
      { property: "og:description", content: "AI-powered anomaly detection and investigation platform for the MPLADS scheme." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <SidebarProvider defaultOpen={true}>
        <CommandPalette />
        <div className="flex min-h-screen w-full bg-background">
          <AppSidebar />

          <div className="flex flex-1 flex-col">
            <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b border-border bg-surface px-4">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="h-6" />
              <div className="flex flex-col">
                <h1 className="text-base font-semibold leading-tight text-foreground">
                  MPLADS Intelligence Platform
                </h1>
                <p className="text-xs text-muted-foreground">
                  AI-assisted anomaly detection & investigation for the MPLADS scheme
                </p>
              </div>
              <button
                type="button"
                onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))}
                className="ml-auto hidden items-center gap-1.5 rounded-md border border-border bg-surface-sunken px-2.5 py-1 text-xs text-ink-muted transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800 sm:flex"
              >
                Search everything
                <kbd className="rounded border border-border-strong bg-surface px-1 text-[10px]">Ctrl K</kbd>
              </button>
            </header>

            <main className="flex-1 p-4 lg:p-6">
              <Outlet />
            </main>

            <footer className="border-t border-border bg-card px-4 py-3">
              <p className="text-center text-xs text-muted-foreground">
                Rule engine + Isolation Forest detection, validated against a labeled synthetic
                benchmark - see Model Evaluation for methodology and limitations.
              </p>
            </footer>
          </div>
        </div>
      </SidebarProvider>
    </QueryClientProvider>
  );
}
