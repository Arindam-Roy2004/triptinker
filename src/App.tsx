import { MotionConfig } from 'motion/react';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PlannerPage } from '@/features/planner/planner-page';
import { ErrorBoundary } from '@/components/site/error-boundary';
import { ThemeProvider } from '@/hooks/use-theme';

export function App() {
  return (
    <ThemeProvider>
      {/* Respect the OS "reduce motion" setting for every Motion animation. */}
      <MotionConfig reducedMotion="user">
        <TooltipProvider delayDuration={300}>
          <ErrorBoundary>
            <PlannerPage />
          </ErrorBoundary>
          <Toaster position="bottom-center" />
        </TooltipProvider>
      </MotionConfig>
    </ThemeProvider>
  );
}
