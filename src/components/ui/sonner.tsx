import { CheckCircle, Info, SpinnerGap, Warning, WarningOctagon } from '@phosphor-icons/react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';
import { useTheme } from '@/hooks/use-theme';

function Toaster(props: ToasterProps) {
  const { resolved } = useTheme();
  return (
    <Sonner
      theme={resolved}
      className="toaster group"
      icons={{
        success: <CheckCircle className="size-4 text-ok" />,
        info: <Info className="size-4" />,
        warning: <Warning className="size-4 text-warn" />,
        error: <WarningOctagon className="size-4 text-err" />,
        loading: <SpinnerGap className="size-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast: 'font-sans !shadow-[var(--shadow-float)] !border-0 !rounded-xl',
          title: '!text-[14px] !font-medium',
          description: '!text-muted',
          actionButton: '!rounded-lg !bg-ink-strong !text-bg !font-sans !uppercase !text-[11px] !font-semibold',
        },
      }}
      style={{ '--normal-bg': 'var(--surface)', '--normal-text': 'var(--ink)', '--normal-border': 'var(--line)', '--border-radius': '12px' } as React.CSSProperties}
      {...props}
    />
  );
}

export { Toaster };
