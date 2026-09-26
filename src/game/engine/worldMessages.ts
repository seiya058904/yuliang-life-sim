/**
 * 世界主动消息投递。
 *
 * 这是一个**纯选择器**，不是新的推进引擎：它不改变任何数值、不推进剧情、不发
 * 奖励，只在 月结 时判断"世界的哪件已经发生的事值得开口"，然后把作者写好的
 * 文案放进收件箱。
 *
 * 克制来自四条硬规则，而不是靠写文案时"少写点"：
 *  1. 每月最多 `WORLD_MESSAGE_MONTHLY_CAP` 条；
 *  2. 只有一部分月份会开口（`SPEAK_CHANCE_PERMILLE`），且由 seed 决定；
 *  3. 每条消息自带 `cooldownDays`，同一来源不会连着来；
 *  4. 人物消息只对"认识的人"（关系 > 0）开口；公司消息只对"与玩家有交集的
 *     公司"开口 —— 公司自身的演化仍按年份独立发生，不围着玩家转。
 *
 * 选择过程**不消耗** `state.rng` 主随机流：用 (seed, month, id) 的哈希决定，
 * 因此世界消息的加入不会改变事件、求职等既有随机结果，同 seed 依然可复现。
 */
import type { ContentRegistry, GameEffect, GameState, WorldMessageDefinition } from '../content/contracts';
import type { BalanceConfig } from '../balance/config';
import { evaluateCondition } from './conditions';
import { appendMessage } from './lifecycle';

/** 每个月最多发出多少条世界消息。 */
export const WORLD_MESSAGE_MONTHLY_CAP = 1;
/** 有多少比例的月份会真的开口（千分数），其余月份保持安静。 */
export const SPEAK_CHANCE_PERMILLE = 300;

/** 确定性哈希：同一 (seed, month, salt) 永远得到同一个 0–999 的数。 */
export function hashPermille(seed: number, month: number, salt: string): number {
  let hash = 2166136261 ^ (Math.trunc(seed) >>> 0);
  hash = Math.imul(hash ^ (Math.trunc(month) >>> 0), 16777619);
  for (let index = 0; index < salt.length; index += 1) hash = Math.imul(hash ^ salt.charCodeAt(index), 16777619);
  return Math.abs(hash) % 1000;
}

/** 人物消息的门槛：只对认识的人开口。 */
function knowsCharacter(state: GameState, characterId: string): boolean {
  return (state.relationships[characterId] ?? 0) > 0;
}

/**
 * 公司消息的门槛：公司与玩家必须真的有过交集（在职 / 申请过 / 持股 / 持有企业），
 * 否则一条"某家公司扩张了"的消息对玩家没有意义。公司自身的演化不因此改变。
 */
function knowsCompany(state: GameState, content: ContentRegistry, companyId: string): boolean {
  // 在职 / 待生效的岗位。
  if (state.employment?.companyId === companyId) return true;
  // 曾经在这家公司工作过。
  if ((state.employmentHistory ?? []).some((entry) => entry.companyId === companyId)) return true;
  // 投递过（包括正在处理与已经结束的）。
  if ((state.applications ?? []).some((entry) => entry.companyId === companyId)) return true;
  // 持有这家公司的投资标的。
  const investments = content.investments ?? [];
  if (investments.some((entry) => entry.companyId === companyId && state.investments?.[entry.id])) return true;
  // 报名的岗位属于这家公司（用已解锁岗位做近似，来源是玩家可见内容）。
  return (content.jobs ?? []).some((job) => job.companyId === companyId && state.unlockedJobIds.includes(job.id));
}

/** 地点消息的门槛：去过这个地方，或者已经在那里有了经营。 */
function knowsLocation(state: GameState, locationId: string): boolean {
  if ((state.locationVisits?.[locationId] ?? 0) > 0) return true;
  return Object.keys(state.businesses).length > 0;
}

function isEligible(
  definition: WorldMessageDefinition,
  state: GameState,
  content: ContentRegistry,
  balance: BalanceConfig,
): boolean {
  if (definition.once && (state.worldMessagesSeen ?? []).includes(definition.id)) return false;
  const lastDay = state.worldMessageLog?.[definition.id];
  if (lastDay !== undefined && state.time.day - lastDay < definition.cooldownDays) return false;
  if (definition.characterId) {
    if (!content.characters.some((entry) => entry.id === definition.characterId)) return false;
    if (!knowsCharacter(state, definition.characterId)) return false;
  } else if (definition.companyId) {
    if (!(content.companies ?? []).some((entry) => entry.id === definition.companyId)) return false;
    if (!knowsCompany(state, content, definition.companyId)) return false;
  } else if (definition.locationId) {
    if (!(content.locations ?? []).some((entry) => entry.id === definition.locationId)) return false;
    if (!knowsLocation(state, definition.locationId)) return false;
  } else {
    return false;
  }
  if (definition.condition && !evaluateCondition(definition.condition, state, content, balance)) return false;
  return true;
}

/**
 * 月结时调用一次。返回本次真正投递的条数（0 或 1，取决于上限）。
 */
export function deliverWorldMessages(
  state: GameState,
  content: ContentRegistry,
  balance: BalanceConfig,
  output: GameEffect[],
): number {
  const definitions = content.worldMessages ?? [];
  if (!definitions.length) return 0;

  const month = state.calendar.month;
  // 规则 2：大多数月份保持安静。哈希只用 seed / month，与主随机流无关。
  if (hashPermille(state.rng.seed, month, 'world-message-gate') >= SPEAK_CHANCE_PERMILLE) return 0;

  const candidates = definitions.filter((definition) => isEligible(definition, state, content, balance));
  if (!candidates.length) return 0;

  // 权重优先，权重相同时用哈希打散，避免"永远是同一条"。
  const ranked = [...candidates].sort((left, right) => {
    if (right.weight !== left.weight) return right.weight - left.weight;
    return hashPermille(state.rng.seed, month, left.id) - hashPermille(state.rng.seed, month, right.id);
  });
  const picked = ranked.slice(0, WORLD_MESSAGE_MONTHLY_CAP);

  for (const definition of picked) {
    appendMessage(state, {
      title: definition.title,
      body: definition.body,
      ...(definition.characterId ? { characterId: definition.characterId } : {}),
      sourceId: definition.id,
    });
    state.worldMessageLog = { ...(state.worldMessageLog ?? {}), [definition.id]: state.time.day };
    if (definition.once) state.worldMessagesSeen = [...new Set([...(state.worldMessagesSeen ?? []), definition.id])];
    output.push({ type: 'message', text: `${definition.title}（新消息）` });
  }
  return picked.length;
}
