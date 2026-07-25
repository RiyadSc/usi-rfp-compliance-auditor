const frameClass =
  'surface-inset mono max-h-96 overflow-auto whitespace-pre-wrap p-4 text-[0.8125rem] leading-relaxed text-ink-soft';

export function EvidenceHighlight({ text, quote }: { text: string; quote: string }) {
  const at = quote ? text.indexOf(quote) : -1;
  if (at < 0) return <pre className={frameClass}>{text}</pre>;
  return (
    <pre className={frameClass}>
      {text.slice(0, at)}
      <mark className="evidence-highlight text-ink">{text.slice(at, at + quote.length)}</mark>
      {text.slice(at + quote.length)}
    </pre>
  );
}
