# Canonical normalized document model

Version: `normalized-document-v1` / `normalized-table-v1`

Every approved source format becomes the same workspace-scoped hierarchy:

```text
normalized document
├── pages or logical source units
│   ├── ordered blocks
│   └── structured tables
│       └── cells
└── heading sections
```

The document binds source hash, format, adapter, parser version, normalization version, statistics, warnings, and a canonical content hash. Pages preserve physical index and displayed label when the format provides them. DOCX, HTML, TXT, and XLSX use honest native coordinates—paragraph, DOM path, line offset, sheet, and cell range—rather than invented PDF pages.

Blocks preserve type, order, exact and normalized text, parser confidence, source coordinates, section/parent links, and optional bounding boxes. Sections are derived deterministically from heading levels. Tables retain headers, row/column indices, row/column spans, formulas, cached values, units, confidence, continuation links, and source coordinates. Numerical facts are compared only with compatible row, column, role, unit, operator, and material scope.

IDs and hashes are deterministic. Database links include workspace and source-document scope so a nested section, block, table continuation, or cell cannot cross tenants or source documents.

Parser uncertainty is first-class. Image-only, damaged, or low-quality pages remain uncertain until selective OCR or human review supplies dependable evidence. Missing text never becomes a negative source conclusion.
