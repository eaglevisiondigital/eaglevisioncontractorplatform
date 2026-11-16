import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { FieldsForm, type Field } from '../../../src/components/forms';
import '../../../src/styles.css';

// Loopback-only presentation fixture; there is no Operations repository or writer.
if (
  import.meta.env.DEV &&
  import.meta.env.VITE_CONTRACTOR_JOURNEY_PREVIEW === 'true' &&
  location.hostname === '127.0.0.1'
) {
  const fields: Field[] = [
    { name: 'name', label: 'Name', hint: 'Use fictional text only.' },
    {
      name: 'notes',
      label: 'Notes',
      type: 'textarea',
      hint: 'These notes are not saved.',
    },
    {
      name: 'choice',
      label: 'Required choice',
      type: 'select',
      required: true,
      hint: 'Choose a fictional option.',
      options: [
        { value: '', label: 'Choose an option' },
        { value: 'review', label: 'Review' },
      ],
    },
    {
      name: 'optional',
      label: 'Optional choice',
      type: 'select',
      options: [{ value: '', label: 'None' }],
    },
    {
      name: 'confirmed',
      label: 'Fictional confirmation',
      type: 'checkbox',
      hint: 'This is not customer consent.',
    },
  ];
  function Fixture() {
    const [result, setResult] = useState('No callback invoked.');
    return (
      <main>
        <h1>Form accessibility regression fixture</h1>
        <p>Fictional presentation only; no business changes are saved.</p>
        {['First form', 'Second form'].map((label) => (
          <section key={label} aria-label={label}>
            <h2>{label}</h2>
            <FieldsForm
              fields={fields}
              submitLabel="Inspect fictional values"
              secondaryLabel="Inspect secondary intent"
              onSubmit={(values, intent) => {
                setResult(JSON.stringify({ values, intent }));
              }}
            />
          </section>
        ))}
        <output aria-label="Fixture callback">{result}</output>
      </main>
    );
  }
  createRoot(document.getElementById('root')!).render(<Fixture />);
}
