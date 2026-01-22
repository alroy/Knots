import * as React from 'react'
import { cn } from '@/lib/utils'

function Button({
  className,
  ...props
}: React.ComponentProps<'button'>) {
  return (
    <button
      data-slot="button"
      className={cn(
        'inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground font-medium transition-colors',
        'hover:bg-primary/90',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:pointer-events-none disabled:opacity-50',
        'h-10 px-4 py-2',
        className,
      )}
      {...props}
    />
  )
}

export { Button }
