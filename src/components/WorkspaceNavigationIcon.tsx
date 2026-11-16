// Existing destinations only. Icons do not change module visibility or authority.
const paths: Readonly<Record<string, readonly string[]>> = {
  Overview: ['m3 10 9-7 9 7', 'M5 9v12h5v-7h4v7h5V9'],
  Customers: [
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2',
    'M16 3a4 4 0 0 1 0 8',
    'M22 21v-2a4 4 0 0 0-3-3.87',
    'M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  ],
  Intake: ['M4 4h16v16H4z', 'm8 10 4 4 4-4', 'M12 6v8'],
  'Property operations': ['m3 10 9-7 9 7', 'M5 9v12h14V9', 'M9 14h6v7H9z'],
  'Supplier comparison': [
    'M3 4h7v16H3z',
    'M14 4h7v16h-7z',
    'm5 8 1 1 2-2',
    'M16 8h3',
    'M5 13h3',
    'M16 13h3',
  ],
  'Client project view': ['M4 3h16v18H4z', 'M8 7h8', 'm8 13 3 3 5-6'],
  Team: [
    'M4 21v-3a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v3',
    'M16 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  ],
  Estimates: ['M5 3h9l5 5v13H5z', 'M14 3v6h5', 'M9 13h6', 'M9 17h6'],
  Catalog: ['m3 6 9-4 9 4-9 4z', 'M3 6v12l9 4 9-4V6', 'M12 10v12'],
  Jobs: ['M3 7h18v14H3z', 'M8 7V3h8v4', 'M3 12h18', 'M10 11v3h4v-3'],
  Workforce: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18', 'M12 7v5l4 2'],
  Contracts: ['M5 3h14v18H5z', 'M8 7h8', 'M8 11h8', 'm8 16 2 2 6-5'],
  Invoices: ['M4 3h16v18l-4-2-4 2-4-2-4 2z', 'M8 7h8', 'M8 11h8', 'M8 15h4'],
  Payments: ['M3 5h18v14H3z', 'M3 9h18', 'M7 15h4'],
  Documents: ['M4 3h11l5 5v13H4z', 'M15 3v6h5', 'M8 13h8', 'M8 17h8'],
  'Company settings': [
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
    'M10 2h4l1 3 3 1 3 3-1 3 1 3-3 3-3 1-1 3h-4l-1-3-3-1-3-3 1-3-1-3 3-3 3-1z',
  ],
  Organizations: [
    'M3 21V7h8v14',
    'M11 3h10v18',
    'M6 11h2',
    'M6 15h2',
    'M15 7h2',
    'M15 11h2',
    'M15 15h2',
    'M1 21h22',
  ],
  'Access & security': [
    'm12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6z',
    'm8 12 3 3 5-6',
  ],
  'Module readiness': [
    'M3 3h7v7H3z',
    'M14 3h7v7h-7z',
    'M3 14h7v7H3z',
    'm14 18 3 3 5-7',
  ],
  Activity: ['M3 12h4l3-8 4 16 3-8h4'],
};
const fallback = [
  'M3 3h7v7H3z',
  'M14 3h7v7h-7z',
  'M3 14h7v7H3z',
  'M14 14h7v7h-7z',
];
export function WorkspaceNavigationIcon({ name }: { name: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {(Object.hasOwn(paths, name) ? paths[name] : fallback).map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}
