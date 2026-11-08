import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { STORAGE_KEYS } from '@/lib/keys';
import { removeStored } from '@/lib/storage';

type State = { error: Error | null };

/** Last line of defence: a rendering bug shows a recovery screen instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6">
        <p className="label text-muted">Unexpected error</p>
        <h1 className="font-display text-4xl">This page hit a snag.</h1>
        <p className="text-muted">Reloading usually fixes it. If it keeps happening, clear the current workspace — saved trips are kept.</p>
        <div className="flex gap-2">
          <Button onClick={() => window.location.reload()}>Reload</Button>
          <Button
            variant="secondary"
            onClick={() => {
              removeStored(STORAGE_KEYS.workspace);
              window.location.reload();
            }}
          >
            Clear workspace
          </Button>
        </div>
      </div>
    );
  }
}
