import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Vibrant's control edges and hover colour mixes, retaining TripTinker's palette,
 * typography, dimensions and existing press animation.
 */
const buttonVariants = cva(
  'relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg font-sans font-semibold uppercase select-none outline-none transition-[background-color,box-shadow,color,transform] duration-75 ease-in active:scale-95 disabled:pointer-events-none disabled:opacity-50 focus-visible:ring-3 focus-visible:ring-brand/30 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'control-edge control-primary bg-brand text-brand-ink shadow-[0_0_0_1px_var(--brand-ring),inset_0_-3px_6px_-3px_rgb(0_30_28/0.18),0_1px_1px_rgb(10_85_80/0.12),0_2px_4px_rgb(10_85_80/0.16)]',
        secondary:
          'control-edge control-outline bg-surface text-ink shadow-[var(--control-shadow)]',
        ghost: 'text-ink hover:bg-sunken aria-expanded:bg-sunken',
        clay: 'control-edge control-clay bg-clay text-white shadow-[0_0_0_1px_var(--clay-ring),inset_0_-3px_6px_-3px_rgb(90_30_10/0.18),0_1px_1px_rgb(150_60_30/0.12),0_2px_4px_rgb(150_60_30/0.16)]',
        danger:
          'bg-surface text-err shadow-[0_0_0_1px_color-mix(in_oklab,var(--err)_30%,transparent),0_1px_1px_rgb(0_0_0/0.03)] hover:bg-err-wash',
        link: 'h-auto px-0 text-brand normal-case hover:underline underline-offset-4 active:scale-100',
      },
      size: {
        sm: 'h-7 px-3 text-xs [&_svg]:size-3.5',
        default: 'h-8 px-4 text-[13px] leading-5 [&_svg]:size-4',
        lg: 'h-10 px-5 text-sm [&_svg]:size-4',
        icon: 'size-8 [&_svg]:size-4',
        'icon-sm': 'size-7 rounded-lg [&_svg]:size-3.5',
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
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

// eslint-disable-next-line react-refresh/only-export-components
export { Button, buttonVariants };
