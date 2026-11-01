import { buildReview, type MaterialSource } from './import';
export function syntheticMaterials(currency = 'USD') {
  const make = (
    vendor: string,
    filename: string,
    description: string,
    quantity: string,
    cost: string,
    total: string,
    index: number,
  ): MaterialSource => ({
    id: crypto.randomUUID(),
    filename,
    sha256: String(index).padStart(64, '0'),
    status: 'clean',
    provenance: 'synthetic_fixture',
    extraction: {
      schema_version: 1,
      vendor,
      quoted_on: '2026-10-01',
      currency,
      total_text: total,
      warnings: [],
      lines: [
        {
          id: crypto.randomUUID(),
          description,
          sku: `DEMO-${index}`,
          quantity_text: quantity,
          unit_text: 'each',
          unit_cost_text: cost,
          extension_text: total,
          confidence: index === 1 ? 0.96 : 0.72,
          reference: {
            page: 1,
            sheet: null,
            cell: null,
            excerpt: `${description} · ${quantity} × ${cost}`,
          },
        },
      ],
    },
  });
  return buildReview(
    [
      make(
        'Example Building Supply',
        'synthetic-supplier-quote.pdf',
        'Pressure-treated fence panels',
        '12',
        '68.25',
        '819.00',
        1,
      ),
      make(
        'Example Hardware',
        'synthetic-hardware-photo.jpg',
        'Exterior fastener kits',
        '6',
        '14.50',
        '87.00',
        2,
      ),
    ],
    currency,
    { mode: 'percent', value: 2000 },
  );
}
