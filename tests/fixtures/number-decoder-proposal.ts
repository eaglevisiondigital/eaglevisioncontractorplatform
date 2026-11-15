import ts from 'typescript';
import { captureNumberDecoder } from '../../proposals/commercial-invoice-number-decoder/qualify.mjs';
import type { presentIssuedInvoice } from '../../proposals/commercial-invoice-issuance/presentation';
export type NumberExpected = Parameters<typeof presentIssuedInvoice>[1] & {
  issuedNumber?: string;
  issuanceReceiptId?: string;
};
export type NumberPresenter = (
  value: unknown,
  expected: NumberExpected,
) => ReturnType<typeof presentIssuedInvoice>;
/** Fixture-only compilation of hash-sealed source; no operational adapter. */
export async function loadNumberDecoder() {
  const q = captureNumberDecoder(process.cwd());
  const compiled = ts.transpileModule(q.source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
    reportDiagnostics: true,
  });
  if (
    compiled.diagnostics?.some(
      (d) => d.category === ts.DiagnosticCategory.Error,
    )
  )
    throw Error('Proposed decoder compilation failed');
  const code = compiled.outputText;
  const module = (await import(
    'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
  )) as { presentIssuedInvoice: NumberPresenter };
  if (typeof module.presentIssuedInvoice !== 'function')
    throw Error('Exact proposed decoder required');
  return { present: module.presentIssuedInvoice, q };
}

export async function loadCustomerNumberDecoder() {
  const q = captureNumberDecoder(process.cwd());
  const code = ts.transpileModule(q.customerSource, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
    reportDiagnostics: true,
  });
  if (code.diagnostics?.some((d) => d.category === ts.DiagnosticCategory.Error))
    throw Error('Customer decoder compilation failed');
  const m = (await import(
    'data:text/javascript;base64,' +
      Buffer.from(code.outputText).toString('base64')
  )) as {
    commercialCustomerResponse: (
      value: unknown,
      expected: unknown,
      now?: number,
    ) => Record<string, unknown>;
    CommercialCustomerReadController: new (
      current: () => unknown,
      load: (input: unknown, signal: AbortSignal) => Promise<unknown>,
      enabled?: boolean,
    ) => {
      open(): Promise<void>;
      invalidate(): void;
      getSnapshot(): { status: string; value?: Record<string, unknown> };
      close(): void;
    };
  };
  return { ...m, q };
}
