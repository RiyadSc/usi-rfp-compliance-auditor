export function EvidenceHighlight({ text, quote }: { text: string; quote: string }) {
  const at = quote ? text.indexOf(quote) : -1;
  if (at < 0)
    return (
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-3 text-sm">
        {text}
      </pre>
    );
  return (
    <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-3 text-sm">
      {text.slice(0, at)}
      <mark className="rounded bg-yellow-200 px-0.5">{text.slice(at, at + quote.length)}</mark>
      {text.slice(at + quote.length)}
    </pre>
  );
}
