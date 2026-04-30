import ReactMarkdown from 'react-markdown';

export function MdPreview({ markdown, compact = false }: { markdown: string; compact?: boolean }) {
  return (
    <div
      className={`overflow-auto rounded-lg border border-border bg-surface-2 text-sm leading-7 text-text-2 ${
        compact ? 'max-h-[300px] px-4 py-3' : 'max-h-[72vh] px-5 py-4'
      }`}
    >
      <ReactMarkdown
        components={{
          h1: ({ children }) => <h1 className="mb-4 text-2xl font-semibold text-text">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-3 mt-5 text-xl font-semibold text-text">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-2 mt-4 text-lg font-semibold text-text">{children}</h3>,
          p: ({ children }) => <p className="my-3 text-text-2">{children}</p>,
          blockquote: ({ children }) => (
            <blockquote className="my-4 rounded-lg border border-accent/25 bg-accent/10 px-4 py-3 text-text">
              {children}
            </blockquote>
          ),
          ul: ({ children }) => <ul className="my-4 list-disc space-y-2 pl-6">{children}</ul>,
          ol: ({ children }) => <ol className="my-4 list-decimal space-y-2 pl-6">{children}</ol>,
          li: ({ children }) => <li className="pl-1 text-text-2">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-accent-hi">{children}</strong>,
          a: ({ children, href }) => (
            <a className="text-accent-hi underline decoration-accent/40 underline-offset-4" href={href}>
              {children}
            </a>
          ),
          code: ({ children }) => (
            <code className="rounded border border-accent/20 bg-accent/10 px-1.5 py-0.5 font-mono text-xs text-accent-hi">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="my-4 overflow-auto rounded-lg border border-border bg-bg p-4 font-mono text-xs text-text-2">
              {children}
            </pre>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
