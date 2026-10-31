// Browser-test composition only: never imported by App or served as an application route.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CustomerEstimateReview } from '../../../src/components/property/CustomerEstimateReview';
import { CustomerPortalPreviewModel } from '../../../src/lib/customer-preview';
import { PropertyRepository } from '../../../src/lib/property';
import { Operations } from '../../../src/lib/operations';
import { sampleCompanies } from '../../../src/domain/platform';

void (async () => {
  const models = sampleCompanies
    .slice(0, 2)
    .map(
      (c) =>
        new CustomerPortalPreviewModel(
          c,
          new PropertyRepository(new Operations(true)),
        ),
    );
  for (const m of models) {
    await m.login();
    await m.prepareHistory();
    await m.prepare();
  }
  const home = models[0].read().context.location_id;
  let release: () => void = () => {};
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  function Harness() {
    const [index, select] = useState(0),
      [one, filter] = useState(false),
      [, render] = useState(0);
    const model = models[index],
      data = model.read();
    return (
      <main>
        <h1>Isolated real-component response timing test</h1>
        <button
          onClick={() => {
            model.selectProperty(model.properties()[1].id);
            render((x) => x + 1);
          }}
        >
          Switch property
        </button>
        <button
          onClick={() => {
            model.selectProperty(home);
            render((x) => x + 1);
          }}
        >
          Return original property
        </button>
        <button onClick={() => select(1)}>Switch contractor</button>
        <button onClick={() => filter(true)}>Show version 1 only</button>
        <button onClick={() => filter(false)}>Show all versions</button>
        <button onClick={release}>Release response</button>
        <CustomerEstimateReview
          key={index + data.context.location_id + one}
          changeRequests
          data={{
            ...data,
            reviews: one ? data.reviews.slice(0, 1) : data.reviews,
          }}
          busy={false}
          onRespond={async (...args) => {
            const receipt = await model.respond(...args);
            await delayed;
            render((x) => x + 1);
            return receipt;
          }}
          onReconcile={async (version) => model.reconcileResponse(version)}
          onViewReports={() => {}}
        />
      </main>
    );
  }
  createRoot(document.getElementById('root')!).render(<Harness />);
})();
