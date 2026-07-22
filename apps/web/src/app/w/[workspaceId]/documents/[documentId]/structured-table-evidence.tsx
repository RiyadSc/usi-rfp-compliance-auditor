type Cell = {
  id: string;
  row_index: number;
  column_index: number;
  row_span: number;
  column_span: number;
  raw_text: string;
  cell_role: string;
  provenance: Record<string, unknown>;
};

type Table = {
  id: string;
  title: string | null;
  caption: string | null;
  row_count: number;
  column_count: number;
  confidence: number;
  continuation_of_table_id: string | null;
  repeated_header: boolean;
  cells: Cell[];
};

export function StructuredTableEvidence({ tables }: { tables: Table[] }) {
  if (!tables.length) return null;
  return (
    <section aria-labelledby="structured-tables-heading" className="mt-6 space-y-4">
      <div>
        <h2 id="structured-tables-heading" className="text-lg font-semibold">
          Structured table evidence
        </h2>
        <p className="text-sm text-slate-600">
          Values remain attached to their row, column, sheet/page, and cell coordinates. They are
          not flattened into unrelated prose.
        </p>
      </div>
      {tables.map((table) => {
        const byPosition = new Map(
          table.cells.map((cell) => [`${cell.row_index}:${cell.column_index}`, cell]),
        );
        return (
          <article
            key={table.id}
            className="overflow-hidden rounded border border-slate-200 bg-white"
          >
            <div className="border-b border-slate-200 px-3 py-2">
              <h3 className="font-medium">{table.title ?? table.caption ?? 'Detected table'}</h3>
              <p className="text-xs text-slate-500">
                {table.row_count} rows × {table.column_count} columns · confidence{' '}
                {Math.round(Number(table.confidence) * 100)}%
                {table.repeated_header ? ' · repeated header' : ''}
                {table.continuation_of_table_id ? ' · continuation of prior table' : ''}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <tbody>
                  {Array.from({ length: table.row_count }, (_, rowIndex) => (
                    <tr key={rowIndex}>
                      {Array.from({ length: table.column_count }, (_, columnIndex) => {
                        const cell = byPosition.get(`${rowIndex}:${columnIndex}`);
                        if (!cell)
                          return <td key={columnIndex} className="border border-slate-200 p-2" />;
                        const Tag =
                          cell.cell_role === 'header' || cell.cell_role === 'row_header'
                            ? 'th'
                            : 'td';
                        return (
                          <Tag
                            key={cell.id}
                            rowSpan={cell.row_span}
                            colSpan={cell.column_span}
                            scope={
                              cell.cell_role === 'header'
                                ? 'col'
                                : cell.cell_role === 'row_header'
                                  ? 'row'
                                  : undefined
                            }
                            className="border border-slate-200 p-2 text-left align-top"
                          >
                            <span>{cell.raw_text || '—'}</span>
                            <span className="mt-1 block text-[11px] font-normal text-slate-500">
                              {String(
                                cell.provenance.sheetName ??
                                  cell.provenance.cellRange ??
                                  `row ${rowIndex + 1}, column ${columnIndex + 1}`,
                              )}
                            </span>
                          </Tag>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        );
      })}
    </section>
  );
}
