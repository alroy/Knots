import * as React from 'react'
import { cn } from '@/lib/utils'

interface ButtonProps extends React.ComponentProps<'button'> {
  size?: 'default' | 'sm' | 'lg' | 'icon'
  variant?: 'default' | 'ghost' | 'outline' | 'destructive'
}

function Button({
  className,
  size = 'default',
  variant = 'default',
  ...props
}: ButtonProps) {
  return (
    <button
      data-slot="button"
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/20',
        'disabled:pointer-events-none disabled:opacity-50',
        {
          'bg-primary text-primary-foreground hover:bg-primary/90': variant === 'default',
          'bg-transparent text-foreground hover:bg-accent': variant === 'ghost',
          'border border-border bg-transparent text-foreground hover:bg-accent': variant === 'outline',
          'bg-red-600 text-white hover:bg-red-700': variant === 'destructive',
        },
        {
          'h-10 px-4 py-2': size === 'default',
          'h-9 px-3 text-sm': size === 'sm',
          'h-11 px-8': size === 'lg',
          'h-10 w-10 p-0': size === 'icon',
        },
        className,
      )}
      {...props}
    />
  )
}

export { Button }
