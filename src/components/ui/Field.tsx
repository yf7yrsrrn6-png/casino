import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'

const baseControl =
  'focus-ring w-full rounded-xl border border-border bg-surface-2 text-text placeholder:text-subtle transition-colors hover:border-border-strong focus:border-accent disabled:opacity-50 tnum'

export function Label({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between">
      <span className="text-[13px] font-medium text-muted">{children}</span>
      {hint && <span className="text-[11px] text-subtle">{hint}</span>}
    </div>
  )
}

export function Field({
  label,
  hint,
  children,
  className = '',
}: {
  label?: string
  hint?: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={`block ${className}`}>
      {label && <Label hint={hint}>{label}</Label>}
      {children}
    </label>
  )
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${baseControl} h-10 px-3 text-sm ${className}`} {...props} />
}

export function Textarea({
  className = '',
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`${baseControl} min-h-24 px-3 py-2.5 text-sm leading-relaxed resize-y ${className}`}
      {...props}
    />
  )
}

export function Select({
  className = '',
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${baseControl} h-10 px-3 text-sm cursor-pointer ${className}`} {...props}>
      {children}
    </select>
  )
}
