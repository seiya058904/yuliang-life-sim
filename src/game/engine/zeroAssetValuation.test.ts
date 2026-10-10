import { expect, it } from 'vitest';
import { balanceConfig as balance } from '../balance/config';
import { contentRegistry as content } from '../content/registry';
import { migrateGameState } from '../store/gameStore';
import { dispatchGameAction } from './actions';
import { calculateNetWorth, wealthAllocationBreakdown } from './economy';
import { createInitialState } from './initialState';

// Zero is a valid imported value. Normal vehicle depreciation currently has a
// floor, so this regression makes no claim about reaching zero through play.
it.each([0, 100, 35_000])('preserves the imported asset valuation %i through display and sale', (valuation) => {
  const state = createInitialState(content, balance, 1);
  state.assets['asset.used-compact'] = {
    assetId: 'asset.used-compact', purchasePrice: 35_000,
    purchaseDay: 1, currentValuation: valuation,
  };
  const migrated = migrateGameState(JSON.parse(JSON.stringify(state)), content, balance);
  expect(migrated.assets['asset.used-compact'].currentValuation).toBe(valuation);
  const withoutAsset = structuredClone(migrated);
  withoutAsset.assets = {};
  const beforeWorth = calculateNetWorth(migrated, content, balance);
  expect(beforeWorth - calculateNetWorth(withoutAsset, content, balance)).toBe(valuation);
  expect(wealthAllocationBreakdown(migrated, content, balance).find(entry => entry.key === 'vehicles_collectibles')?.value).toBe(valuation);
  const sold = dispatchGameAction(migrated, { type: 'sell_asset', assetId: 'asset.used-compact' }, content, balance);
  expect(sold.error).toBeUndefined();
  expect(sold.state.cash - migrated.cash).toBe(valuation);
  expect(calculateNetWorth(sold.state, content, balance)).toBe(beforeWorth);
  expect(sold.state.assets['asset.used-compact']).toBeUndefined();
});
