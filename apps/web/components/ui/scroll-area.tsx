'use client';
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
export function ScrollArea({
  className,
  children,
  ...props
}: ComponentProps<typeof ScrollAreaPrimitive.Root>) {
  return (
    <ScrollAreaPrimitive.Root
      className={cn('ui-scroll-area', className)}
      type="auto"
      {...props}
    >
      <ScrollAreaPrimitive.Viewport className="ui-scroll-viewport">
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollAreaPrimitive.Scrollbar
        orientation="vertical"
        className="ui-scrollbar"
      >
        <ScrollAreaPrimitive.Thumb className="ui-scroll-thumb" />
      </ScrollAreaPrimitive.Scrollbar>
      <ScrollAreaPrimitive.Scrollbar
        orientation="horizontal"
        className="ui-scrollbar horizontal"
      >
        <ScrollAreaPrimitive.Thumb className="ui-scroll-thumb" />
      </ScrollAreaPrimitive.Scrollbar>
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}
