import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { sampleCompanies } from '../../../src/domain/platform';
import { CustomerPortalPreviewModel } from '../../../src/lib/customer-preview';
import { Operations } from '../../../src/lib/operations';
import { PropertyRepository } from '../../../src/lib/property';
import { ProofOfWorkPackPreview } from '../../../src/components/property/ProofOfWorkPackPreview';
import '../../../src/styles.css';
const model = new CustomerPortalPreviewModel(
  sampleCompanies[0],
  new PropertyRepository(new Operations(true)),
);
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main>
      <ProofOfWorkPackPreview model={model} />
    </main>
  </StrictMode>,
);
