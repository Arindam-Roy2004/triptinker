import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Vibrant's button (vibrant.design), on TripTinker's palette: filled variants paint the layered
 * `.t-surface` from globals.css on a ::before, so a press scales the surface and never the label.
 * Ghost and link are plain text buttons, as on Vibrant.
 */
const buttonVariants = cva(
  'relative isolate inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-clip-padding font-sans font-medium select-none outline-none transition-[color,background-color,box-shadow,scale] duration-150 ease-out focus-visible:ring-3 focus-visible:ring-brand/40 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 't-surface t-surface-primary text-brand-ink',
        secondary: 't-surface t-surface-outline text-ink',
        signal: 'signal-fill',
        danger: 't-surface t-surface-danger text-err',
        destructive: 't-surface t-surface-destructive text-white',
        ghost: 'text-ink hover:bg-ink/6 active:scale-[0.97] aria-expanded:bg-ink/6',
        link: 'h-auto px-0 text-brand underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-7 rounded-md px-2.5 text-[12px] [&_svg]:size-3.5',
        default: 'h-8 px-3 text-[13px] [&_svg]:size-4',
        lg: 'h-9 px-4 text-sm [&_svg]:size-4',
        icon: 'size-8 [&_svg]:size-4',
        'icon-sm': 'size-7 rounded-md [&_svg]:size-3.5',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'default' },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'button';
  return <Comp data-slot="button" data-variant={variant ?? 'secondary'} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

// eslint-disable-next-line react-refresh/only-export-components
export { Button, buttonVariants };
