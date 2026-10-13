'use client';

import { DialogContent } from '@predict/ui/dialog';
import { cn } from '@predict/ui/utils';
import type { ComponentProps } from 'react';

export {
  Dialog as Sheet,
  DialogClose as SheetClose,
  DialogDescription as SheetDescription,
  DialogTitle as SheetTitle,
  DialogTrigger as SheetTrigger,
} from '@predict/ui/dialog';

/** A dialog that slides in from the right edge: full height, full width on phones. */
export function SheetContent({ className, ...props }: ComponentProps<typeof DialogContent>) {
  return (
    <DialogContent
      className={cn(
        'top-0 right-0 left-auto h-dvh max-h-dvh w-full max-w-xl translate-x-0 translate-y-0 gap-5 rounded-none p-5 sm:rounded-l-lg sm:p-6',
        className,
      )}
      {...props}
    />
  );
}
