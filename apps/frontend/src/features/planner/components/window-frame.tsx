import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** An app window — three quiet dots, a title, an optional action — floated over a scene or a crosshatched cell. */
export function WindowFrame({ title, action, children, className, bodyClassName }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <div className={cn('flex min-h-0 flex-col overflow-hidden rounded-md bg-surface shadow-lift', className)}>
      <div className="flex h-10 shrink-0 items-center gap-3 border-b border-line px-3">
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-[#FF5F57] shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.12)]" />
          <span className="size-2.5 rounded-full bg-[#FEBC2E] shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.12)]" />
          <span className="size-2.5 rounded-full bg-[#28C840] shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.12)]" />
        </span>
        <span className="label min-w-0 flex-1 truncate text-center text-[11px] text-muted">{title}</span>
        <span className="flex min-w-[42px] justify-end">{action}</span>
      </div>
      <div className={cn('min-h-0 flex-1', bodyClassName)}>{children}</div>
    </div>
  );
}

/**
 * A scene as a calm backdrop behind a window. The pixel art stays crisp; a wash from the page
 * colour at the top and bottom settles it into the surface around it (Aceternity Inference).
 */
export function SceneBackdrop({ src, children, className }: { src: string; children: ReactNode; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <div className={cn('relative isolate overflow-hidden bg-sunken', className)}>
      {failed !== src && <img src={src} alt="" aria-hidden onError={() => setFailed(src)} className="absolute inset-0 -z-20 size-full object-cover [image-rendering:pixelated]" />}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[linear-gradient(to_bottom,color-mix(in_oklab,var(--surface)_55%,transparent),transparent_35%,transparent_65%,color-mix(in_oklab,var(--surface)_60%,transparent))] dark:bg-[linear-gradient(to_bottom,color-mix(in_oklab,var(--bg)_60%,transparent),color-mix(in_oklab,var(--bg)_15%,transparent)_40%,color-mix(in_oklab,var(--bg)_25%,transparent)_70%,color-mix(in_oklab,var(--bg)_70%,transparent))]"
      />
      {children}
    </div>
  );
}
