import * as React from 'react';

import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        default: 'bg-slate-700 text-slate-100',
        blue: 'bg-blue-500/15 text-blue-300 ring-1 ring-inset ring-blue-500/30',
        green: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30',
        amber: 'bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/30',
        red: 'bg-red-500/15 text-red-300 ring-1 ring-inset ring-red-500/30',
        slate: 'bg-slate-800 text-slate-300 ring-1 ring-inset ring-slate-700',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export const Badge = ({ className, variant, ...props }: BadgeProps) => (
  <span className={cn(badgeVariants({ variant }), className)} {...props} />
);
