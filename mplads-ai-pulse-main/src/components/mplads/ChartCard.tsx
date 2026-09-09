import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CardSkeleton, EmptyState, ErrorState } from "./StateViews";

export function ChartCard({
  title,
  explanation,
  loading,
  error,
  onRetry,
  empty,
  children,
  height = 240,
}: {
  title: string;
  explanation?: string | undefined;
  loading?: boolean | undefined;
  error?: unknown;
  onRetry?: (() => void) | undefined;
  empty?: boolean | undefined;
  children: React.ReactNode;
  height?: number | undefined;
}) {
  return (
    <Card className="border-border/80 shadow-none">
      <CardHeader className="space-y-0.5 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {explanation && <p className="text-xs text-muted-foreground">{explanation}</p>}
      </CardHeader>
      <CardContent style={{ height }}>
        {loading ? (
          <CardSkeleton className="h-full w-full" />
        ) : error ? (
          <ErrorState message={(error as Error)?.message} onRetry={onRetry} />
        ) : empty ? (
          <EmptyState title="No data yet" />
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
