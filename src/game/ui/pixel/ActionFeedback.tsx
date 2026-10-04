import { useEffect, useRef, useState } from 'react';
import type { ContentRegistry, GameEffect } from '../../content/contracts';
import { PixelIcon } from './PixelIcon';

const statLabels: Record<string, string> = { ability: '能力', reputation: '声誉', lifestyle: '生活水平', professional: '专业', knowledge: '知识', communication: '沟通', fitness: '体能', appearance: '形象', network: '人脉', mood: '心情' };
const capabilityLabels: Record<string, string> = { remote_work: '远程工作', home_workspace: '居家办公', business_license: '经营资格', market_insight: '市场洞察' };
const signed = (value: number, cash = false) => `${value >= 0 ? '+' : '−'}${cash ? '¥' : ''}${Math.abs(Math.round(value)).toLocaleString('zh-CN')}`;
export interface FeedbackLine { text: string; kind: 'message' | 'change' }

/** Describe actual effects, never replay them or invent a state delta. */
export function describeEffects(effects: readonly GameEffect[], content: ContentRegistry): FeedbackLine[] {
  const messages: string[] = [];
  const changes = new Map<string, { amount: number; cash: boolean }>();
  const add = (label: string, amount: number, cash = false) => {
    const prior = changes.get(label);
    changes.set(label, { amount: (prior?.amount ?? 0) + amount, cash });
  };
  for (const effect of effects) {
    switch (effect.type) {
      case 'cash': add(effect.reason || '现金', effect.amount, true); break;
      case 'stat': add(statLabels[effect.stat] ?? effect.stat, effect.amount); break;
      case 'relation': add(`与${content.characters.find(c => c.id === effect.characterId)?.name ?? '联系人'}的关系`, effect.amount); break;
      case 'purchase': messages.push(`已购买 ${content.items.find(i => i.id === effect.itemId)?.name ?? '商品'} ×${effect.quantity}`); break;
      case 'settlement': messages.push(`第 ${effect.day} 天结算 · 现金 ${signed(effect.cashDelta, true)}`); break;
      case 'month': messages.push(`第 ${effect.summary.month} 月已归档`); break;
      case 'message': messages.push(effect.text); break;
      case 'unlock': {
        const entry = [...content.jobs, ...content.items, ...content.housing, ...content.businesses, ...content.assets, ...content.events].find(e => e.id === effect.id);
        messages.push(`解锁${effect.kind} · ${entry?.name ?? capabilityLabels[effect.id] ?? '新内容'}`);
        break;
      }
      case 'milestone': messages.push(content.milestones.find(m => m.id === effect.milestoneId)?.name ?? '记录了新的人生节点'); break;
      // Time and activity belong in the clock and scene, not a stream of toasts.
      default: break;
    }
  }
  return [
    ...Array.from(new Set(messages)).slice(-2).map(text => ({ text, kind: 'message' as const })),
    ...Array.from(changes).filter(([, value]) => value.amount !== 0).map(([label, value]) => ({ text: `${label} ${signed(value.amount, value.cash)}`, kind: 'change' as const })),
  ].slice(0, 6);
}

interface Receipt { id: number; lines: FeedbackLine[] }
function FeedbackReceipt({ receipt, onExpire }: { receipt: Receipt; onExpire: (id: number) => void }) {
  useEffect(() => {
    const timer = window.setTimeout(() => onExpire(receipt.id), 4200);
    return () => window.clearTimeout(timer);
  }, [receipt.id, onExpire]);
  return <div className="effect-item action-receipt"><PixelIcon name="mail" size={16} /><div>{receipt.lines.map((line, index) => <span className={`feedback-${line.kind}`} key={index}>{line.text}</span>)}</div></div>;
}

/** Each receipt owns its lifetime; the next simulation frame cannot erase a purchase. */
export function ActionFeedback({ effects, content }: { effects: readonly GameEffect[]; content: ContentRegistry }) {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const sequence = useRef(0);
  const previous = useRef<readonly GameEffect[] | null>(null);
  const expire = useRef((id: number) => setReceipts(items => items.filter(item => item.id !== id))).current;
  useEffect(() => {
    if (previous.current === effects) return;
    previous.current = effects;
    const lines = describeEffects(effects, content);
    if (lines.length) {
      const receipt = { id: ++sequence.current, lines };
      setReceipts(items => [...items.slice(-2), receipt]);
    }
  }, [effects, content]);
  return <div className="effect-rail" role="status" aria-label="即时变化" aria-live="polite" aria-atomic="false">{receipts.map(receipt => <FeedbackReceipt key={receipt.id} receipt={receipt} onExpire={expire} />)}</div>;
}
