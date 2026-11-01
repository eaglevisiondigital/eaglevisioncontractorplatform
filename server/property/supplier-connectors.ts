import type {
  SupplierQuote,
  Requirement,
} from '../../src/domain/property/comparison';
/** Interface only. No scraping, credential loader, network client or enabled connector. */
export interface SupplierConnector {
  readonly id: 'home_depot' | 'lowes' | 'menards' | 'local_supplier';
  readonly enabled: false;
  fetchApprovedQuote(
    input: Readonly<{
      organizationId: string;
      accountBindingId: string;
      authorizationId: string;
      locationId: string;
      currency: string;
      materials: Requirement[];
    }>,
  ): Promise<SupplierQuote>;
}
export const supplierConnectors = Object.freeze(
  (['home_depot', 'lowes', 'menards', 'local_supplier'] as const).map((id) =>
    Object.freeze({
      id,
      enabled: false as const,
      async fetchApprovedQuote(): Promise<never> {
        throw Error(
          '503: supplier API account, terms, scoped authorization and genuine acceptance required',
        );
      },
    }),
  ),
);
