import { contentRegistry } from '../src/game/content/registry';
import { validateContent } from '../src/game/content/validateContent';

const result = validateContent(contentRegistry);
if (result.warnings?.length) console.warn(result.warnings.join('\n'));
if (!result.valid) {
  console.error(result.errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`内容验证通过：${contentRegistry.jobs.length} 个工作、${contentRegistry.items.length} 件商品、${contentRegistry.services?.length ?? 0} 项服务、${contentRegistry.subscriptions?.length ?? 0} 项订阅、${contentRegistry.housing.length} 套住房、${contentRegistry.characters.length} 个人物、${contentRegistry.events.length} 个事件、${contentRegistry.eventChains.length} 条事件链、${contentRegistry.businesses.length} 家企业、${contentRegistry.assets.length} 项资产、${contentRegistry.activities?.length ?? 0} 个活动、${contentRegistry.investments?.length ?? 0} 项投资。`);
}
