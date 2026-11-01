import {
  MAX_SOURCE_BYTES,
  type ContentValidator,
  type ExtractionProvider,
} from './pipeline';
import {
  validateExtraction,
  type Extraction,
} from '../../src/domain/materials/import';
const headers = [
  'vendor',
  'quoted_on',
  'currency',
  'description',
  'sku',
  'quantity',
  'unit',
  'unit_cost',
  'line_total',
  'document_total',
];
export function parseSupplierCsv(bytes: Uint8Array): Record<string, string>[] {
  if (bytes.length < 8 || bytes.length > MAX_SOURCE_BYTES)
    throw new Error('CSV size limit');
  const text = new TextDecoder('utf-8', { fatal: true })
    .decode(bytes)
    .replace(/^\uFEFF/, '');
  if (text.includes('\0')) throw new Error('Binary CSV content');
  const rows: string[][] = [];
  let row: string[] = [],
    value = '',
    quoted = false,
    closed = false;
  const field = () => {
    if (value.length > 1000 || row.length >= 50)
      throw new Error('CSV field or column limit');
    row.push(value);
    value = '';
    closed = false;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else value += ch;
    } else if (ch === '"') {
      if (value || closed) throw new Error('Invalid CSV quote');
      quoted = true;
    } else if (ch === ',') {
      field();
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      field();
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
      if (rows.length > 201) throw new Error('CSV row limit');
    } else {
      if (closed) throw new Error('Unexpected text after CSV quote');
      value += ch;
    }
    if (value.length > 1000) throw new Error('CSV field limit');
  }
  if (quoted) throw new Error('Unterminated CSV quote');
  if (value || row.length) {
    field();
    rows.push(row);
  }
  const first = rows.shift();
  if (
    !first ||
    first.length !== headers.length ||
    first.some((h, i) => h !== headers[i]) ||
    !rows.length ||
    rows.length > 200
  )
    throw new Error('Use the documented supplier CSV template headers');
  if (rows.some((r) => r.length !== headers.length))
    throw new Error('Inconsistent CSV columns');
  return rows.map((row) =>
    Object.fromEntries(headers.map((h, i) => [h, row[i]])),
  );
}
export class SupplierCsvValidator implements ContentValidator {
  async validate(bytes: Uint8Array, mime: string) {
    if (mime !== 'text/csv')
      throw new Error('A full image/PDF validator is required');
    parseSupplierCsv(bytes);
  }
}
export class SupplierCsvExtractor implements ExtractionProvider {
  readonly id = 'literal-supplier-csv';
  readonly model = 'schema-1';
  async extract(bytes: Uint8Array, mime: string): Promise<Extraction> {
    if (mime !== 'text/csv') throw new Error('Unsupported CSV extraction type');
    const rows = parseSupplierCsv(bytes);
    const warnings: string[] = [];
    const single = (key: string) => {
      const values = [...new Set(rows.map((r) => r[key]).filter(Boolean))];
      if (values.length !== 1) {
        warnings.push(
          `Missing or conflicting ${key}; split supplier sheets before import`,
        );
        return null;
      }
      return values[0];
    };
    const vendor = single('vendor');
    let date = single('quoted_on');
    const currency = single('currency');
    const total = single('document_total');
    if (
      date &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(Date.parse(date)) ||
        new Date(date).toISOString().slice(0, 10) !== date)
    ) {
      warnings.push(`Invalid quote date: ${date}`);
      date = null;
    }
    const result: Extraction = {
      schema_version: 1,
      vendor,
      quoted_on: date,
      currency,
      total_text: total,
      warnings,
      lines: rows.map((r, i) => ({
        id: crypto.randomUUID(),
        description: r.description,
        sku: r.sku || null,
        quantity_text: r.quantity || null,
        unit_text: r.unit || null,
        unit_cost_text: r.unit_cost || null,
        extension_text: r.line_total || null,
        confidence: null,
        reference: {
          page: null,
          sheet: 'CSV',
          cell: `D${i + 2}:I${i + 2}`,
          excerpt: `${r.description} | ${r.quantity} | ${r.unit_cost} | ${r.line_total}`,
        },
      })),
    };
    return validateExtraction(result);
  }
}
