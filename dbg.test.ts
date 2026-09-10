import { describe, expect, it } from 'vitest';
import { balanceConfig } from './src/game/balance/config';
import { contentRegistry } from './src/game/content/registry';
import { createInitialState } from './src/game/engine/initialState';
import { dispatchGameAction } from './src/game/engine/actions';

describe('dbg', () => {
  it('flag persists', () => {
    const s = createInitialState(contentRegistry, balanceConfig, 1);
    s.cash = 20000;
    s.unlockedCapabilities.push('business_license', 'remote_work');
    s.unlockedBusinessIds.push('business.seed-kiosk');
    let r = dispatchGameAction(s, { type: 'buy_business_stake', businessId: 'business.seed-kiosk', percent: 30 }, contentRegistry, balanceConfig);
    console.log('stake err', r.error);
    r = dispatchGameAction(r.state, { type: 'increase_business_stake', businessId: 'business.seed-kiosk', percent: 20 }, contentRegistry, balanceConfig);
    console.log('raise err', r.error);
    r = dispatchGameAction(r.state, { type: 'make_control_decision', businessId: 'business.seed-kiosk', decisionId: 'streamline_operations' }, contentRegistry, balanceConfig);
    console.log('decision err', r.error);
    console.log('flags', JSON.stringify(Object.keys(r.state.flags)));
    console.log('bonus', r.state.businesses['business.seed-kiosk']?.operatingBonusPercent);
    throw new Error('stop');
  });
});
