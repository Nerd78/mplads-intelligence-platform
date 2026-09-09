import { AlertTriangle, Inbox, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function ErrorState({ message, onRetry }: { message?: string | undefined; onRetry?: (() => void) | undefined }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-12 text-center">
      <AlertTriangle className="h-6 w-6 text-risk-critical" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">Couldn't load this data</p>
        <p className="max-w-sm text-xs text-muted-foreground">{message ?? "The API request failed. Confirm the backend is running."}</p>
      </div>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry} className="gap-1.5">
          <RotateCw className="h-3.5 w-3.5" />
          Retry
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ title = "No results", description }: { title?: string | undefined; description?: string | undefined }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-12 text-center">
      <Inbox className="h-6 w-6 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="max-w-sm text-xs text-muted-foreground">{description}</p>}
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-8 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ className }: { className?: string }) {
  return <Skeleton className={className ?? "h-64 w-full"} />;
}
