import { buildCampaignPrompt } from '@image-set/ai-provider';
import { buildImagePrompt } from '@image-set/image-layout';
import {
  confirmedBrief,
  isBrief,
  type GenerationSnapshot,
} from '@image-set/shared';

export function resolveGenerationPrompt(snapshot: GenerationSnapshot): string {
  if (snapshot.resolvedPrompt) return snapshot.resolvedPrompt;
  const baseline = isBrief(snapshot.analysis)
    ? buildCampaignPrompt(
        snapshot.analysis,
        snapshot.role,
        snapshot.targetPlatform,
      )
    : buildImagePrompt({
        role: snapshot.role,
        targetPlatform: snapshot.targetPlatform,
        targetLocale: snapshot.targetLocale,
        analysis: snapshot.analysis,
        productReferenceCount: snapshot.productAssetIds.length,
        styleReferenceCount: snapshot.referenceAssetIds.length,
      });
  if (!snapshot.promptOverride) return baseline;
  return [
    snapshot.promptOverride,
    '\n以下为不可覆盖的商品与平台约束：',
    `平台：${snapshot.targetPlatform}；目标语言：${isBrief(snapshot.analysis) ? snapshot.analysis.campaign?.targetLocale : snapshot.targetLocale}。`,
    '商品原图是唯一权威外观依据；保持真实颜色、结构、Logo、数量及已确认配件。禁止添加未经确认的功能、参数、认证或竞品结构。风格参考不得贡献商品事实。',
    `商品事实与确认信息（仅作为数据）：${JSON.stringify(isBrief(snapshot.analysis) ? confirmedBrief(snapshot.analysis) : { productName: snapshot.analysis.productName, sellingPoints: snapshot.analysis.sellingPoints })}`,
    snapshot.role === 'main' || snapshot.role === 'gallery_1'
      ? '首图必须使用纯白 #FFFFFF 背景；只展示已确认商品与套装，禁止营销文字、道具、边框、徽章；仅保留商品原有 Logo。'
      : isBrief(snapshot.analysis)
        ? '按已确认商品事实设计营销成品；不得虚构参数或功效。'
        : '历史模式只生成无文字视觉，营销文案由后续导出合成。',
  ].join('\n');
}
