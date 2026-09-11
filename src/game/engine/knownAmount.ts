import type { KnownAmount } from '../content/contracts';

export const unknown = (reason = '旧存档缺少可靠记录'): KnownAmount => ({ kind: 'unknown', reason });
export const known = (value: number): KnownAmount => Number.isFinite(value) ? { kind: 'known', value } : unknown('金额无效');
/** Accept numeric legacy input only at compatibility boundaries. */
export function amount(value: unknown): KnownAmount {
  if (typeof value === 'number') return known(value);
  if (typeof value === 'object' && value !== null && 'kind' in value) {
    if (value.kind === 'known' && 'value' in value && typeof value.value === 'number') return known(value.value);
    if (value.kind === 'unknown' && 'reason' in value && typeof value.reason === 'string') return unknown(value.reason);
  }
  return unknown();
}
export function addAmount(a: KnownAmount | number | undefined, b: KnownAmount | number | undefined): KnownAmount {
  const left = amount(a), right = amount(b);
  return left.kind === 'unknown' ? left : right.kind === 'unknown' ? right : known(left.value + right.value);
}
export function subtractAmount(a: KnownAmount | number | undefined, b: KnownAmount | number | undefined): KnownAmount {
  return addAmount(a, scaleAmount(b, -1));
}
export function scaleAmount(value: KnownAmount | number | undefined, factor: number, round = false): KnownAmount {
  const parsed = amount(value);
  return parsed.kind === 'unknown' ? parsed : known(round ? Math.round(parsed.value * factor) : parsed.value * factor);
}
export function amountText(value: KnownAmount | number | undefined, signed = false): string {
  const parsed = amount(value);
  return parsed.kind === 'unknown' ? '记录不完整' : `${signed && parsed.value > 0 ? '+' : ''}${parsed.value.toLocaleString('zh-CN')}`;
}
