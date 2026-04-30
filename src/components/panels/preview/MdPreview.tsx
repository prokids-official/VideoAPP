import ReactMarkdown from 'react-markdown';

export function MdPreview({ markdown }: { markdown: string }) {
  return (
    <div className="max-h-[72vh] overflow-auto rounded-lg border border-border bg-surface-2 px-5 py-4 text-sm leading-7 text-text-2">
      <ReactMarkdown
        components={{
          h1: ({ children }) => <h1 className="mb-4 text-2xl font-semibold text-text">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-3 mt-5 text-xl font-semibold text-text">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-2 mt-4 text-lg font-semibold text-text">{children}</h3>,
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
