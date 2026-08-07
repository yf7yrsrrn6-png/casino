import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger' | 'subtle'
type Size = 'sm' | 'md' | 'lg' | 'icon'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  children: ReactNode
}

const variantClasses: Record<Variant, string> = {
  // White (or high-contrast) primary — the signature action.
  primary: 'bg-primary text-primary-fg hover:opacity-90 shadow-sm',
  // Blue accent action.
  accent: 'bg-accent text-accent-fg hover:bg-accent-hover shadow-[0_6px_20px_-8px_var(--accent-line)]',
  secondary: 'bg-surface-2 text-text border border-border-strong hover:bg-surface-3',
  subtle: 'bg-surface-2 text-text hover:bg-surface-3',
  ghost: 'bg-transparent text-muted hover:text-text hover:bg-surface-2',
  danger: 'bg-loss text-white hover:brightness-110',
}

const sizeClasses: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] rounded-lg gap-1.5',
  md: 'h-10 px-4 text-sm rounded-xl gap-2',
  lg: 'h-12 px-6 text-[15px] rounded-xl gap-2',
  icon: 'h-9 w-9 rounded-lg justify-center',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`focus-ring inline-flex items-center justify-center font-semibold transition-all duration-150 disabled:opacity-45 disabled:cursor-not-allowed disabled:pointer-events-none cursor-pointer ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
