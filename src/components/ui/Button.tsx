import { forwardRef, type ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'gradient';
type Size = 'sm' | 'md' | 'lg';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-surface-3 text-text border border-border hover:border-border-hi',
  secondary:
    'bg-surface-2 text-text-2 border border-border hover:text-text hover:border-border-hi',
  ghost:
    'bg-transparent text-text-2 hover:text-text hover:bg-surface-2 border border-transparent',
  gradient:
    'bg-gradient-brand text-white border-0 hover:brightness-110 active:translate-y-px shadow-glow',
};

const sizeClasses: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-base',
  lg: 'h-12 px-6 text-md font-semibold',
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'primary', size = 'md', className = '', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center gap-2 rounded transition font-medium tracking-tight cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...rest}
    />
  );
});
