import type { LocalJourney } from '../../lib/workflows/journey-runtime';
import {
  inspectTradeEdition,
  type TradeEditionReview,
} from '../../lib/program/trade-editions';
import { readSalesJobPlanning } from './sales-job-planning-review';
export async function readTradeJobContinuity(
  j: LocalJourney,
  trade: TradeEditionReview,
  admitted: () => boolean,
) {
  const admit = () => {
    if (!admitted()) throw Error('Original trade confirmation withdrawn');
  };
  admit();
  const work = await readSalesJobPlanning(j);
  work.check();
  admit();
  await inspectTradeEdition(trade);
  work.check();
  admit();
  const t = trade.snapshot.target;
  if (
    Object.keys(j.target).some(
      (k) => t[k as keyof typeof t] !== j.target[k as keyof typeof j.target],
    )
  )
    throw Error('Exact original trade/job target required');
  let held = false;
  const check = () => {
    if (held) throw Error('UNKNOWN trade source held');
    try {
      admit();
      work.check();
    } catch (e) {
      held = true;
      throw e;
    }
  };
  const inspect = async () => {
    check();
    try {
      await inspectTradeEdition(trade);
      check();
    } catch (e) {
      held = true;
      throw e;
    }
  };
  check();
  return { work, trade, check, inspect };
}
