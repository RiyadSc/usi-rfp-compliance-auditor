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
        <h2 id="structured-tables-heading" className="section-title">
          Structured table evidence
        </h2>
        <p className="section-lede">
          Values remain attached to their row, column, sheet/page, and cell coordinates. They are
          not flattened into unrelated prose.
        </p>
      </div>
      {tables.map((table) => {
        const byPosition = new Map(
          table.cells.map((cell) => [`${cell.row_index}:${cell.column_index}`, cell]),
        );
        return (
          <article key={table.id} className="data-frame overflow-hidden">
            <div className="border-b border-line-subtle px-4 py-3">
              <h3 className="font-medium text-ink">
                {table.title ?? table.caption ?? 'Detected table'}
              </h3>
              <p className="text-metadata mt-1">
                {table.row_count} rows × {table.column_count} columns · confidence{' '}
                {Math.round(Number(table.confidence) * 100)}%
                {table.repeated_header ? ' · repeated header' : ''}
                {table.continuation_of_table_id ? ' · continuation of prior table' : ''}
              </p>
            </div>
            <div className="data-scroll">
              <table className="data-table data-table-dense min-w-full">
                <tbody>
                  {Array.from({ length: table.row_count }, (_, rowIndex) => (
                    <tr key={rowIndex}>
                      {Array.from({ length: table.column_count }, (_, columnIndex) => {
                        const cell = byPosition.get(`${rowIndex}:${columnIndex}`);
                        if (!cell) return <td key={columnIndex} />;
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
                            className="align-top"
                          >
                            <span>{cell.raw_text || '—'}</span>
                            <span className="mt-1 block text-metadata font-normal">
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
