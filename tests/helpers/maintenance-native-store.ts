import type { TestDatabase } from '../database/engine';
import {
  validateMaintenanceCommand,
  validateMaintenanceSource,
  type MaintenanceCommand,
  type MaintenancePersistence,
  type MaintenanceReceipt,
  type RetainedMaintenance,
} from '../../server/property/maintenance-persistence';
import type { MaintenanceSource } from '../../src/domain/property/maintenance';

/** Disposable native fixture adapter ONLY. No URL, credentials, Auth SDK or application imports. */
export class NativeMaintenanceFixture implements MaintenancePersistence {
  constructor(private readonly db: TestDatabase) {}
  private async call<T extends Record<string, unknown>>(
    name: 'read_item' | 'execute' | 'reconcile',
    input: unknown,
  ) {
    return (
      await this.db.query<{ value: T }>(
        `select maintenance_2a_test.${name}($1::jsonb) value`,
        [JSON.stringify(input)],
      )
    ).rows[0].value;
  }
  read(source: MaintenanceSource) {
    validateMaintenanceSource(source);
    return this.call<RetainedMaintenance & Record<string, unknown>>(
      'read_item',
      source,
    );
  }
  execute(command: MaintenanceCommand) {
    validateMaintenanceCommand(command);
    return this.call<MaintenanceReceipt & Record<string, unknown>>(
      'execute',
      command,
    );
  }
  reconcile(command: MaintenanceCommand) {
    validateMaintenanceCommand(command);
    return this.call<
      (
        | { status: 'committed'; receipt: MaintenanceReceipt }
        | { status: 'undetermined' }
      ) &
        Record<string, unknown>
    >('reconcile', command);
  }
}
