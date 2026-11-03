import type { SavedRevisionPanelProps } from '../../lib/workflows/saved-revision-contract';
import { MaintenanceSavedRevisions } from './MaintenanceSavedRevisions';
import { SavedEvidenceControls } from './SavedEvidenceControls';
import { maintenanceRenewalEvidenceRecipe } from '../../lib/workflows/maintenance-renewal-evidence';
import './maintenance-renewal-evidence.css';
/** Existing maintenance workspace with actual same-job renewal planning evidence files. */
export function MaintenanceRenewalEvidence(props: SavedRevisionPanelProps) {
  return (
    <section
      className="maintenance-renewal-evidence"
      aria-label="Maintenance renewal evidence"
    >
      <MaintenanceSavedRevisions {...props} />
      <SavedEvidenceControls
        {...props}
        recipe={maintenanceRenewalEvidenceRecipe}
      />
    </section>
  );
}
