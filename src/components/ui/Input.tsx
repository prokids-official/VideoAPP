import { forwardRef, useId, type InputHTMLAttributes } from 'react';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  mono?: boolean;
}

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { label, hint, error, mono, className = '', id, ...rest },
  ref,
) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  return (
    <div className="mb-4">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm text-text-2 font-medium mb-2"
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        ref={ref}
        className={`w-full h-11 px-3.5 rounded bg-surface-2 border text-text outline-none transition placeholder:text-text-4 ${
          error
            ? 'border-bad'
            : 'border-border focus:border-accent/35 focus:bg-surface-3'
        } ${mono ? 'font-mono text-sm' : 'font-sans text-base'} ${className}`}
        {...rest}
      />
      {error ? (
        <div className="font-mono text-xs text-bad mt-2">{error}</div>
      ) : hint ? (
        <div className="font-mono text-xs text-text-3 mt-2">{hint}</div>
      ) : null}
    </div>
  );
});
