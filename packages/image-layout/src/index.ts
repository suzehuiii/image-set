import sharp from 'sharp';
import {
  imageRoleKind,
  type ImageRole,
  type ProductAnalysisResult,
} from '@image-set/shared';

export const EXPORT_SIZE = 2048;

export type ImageLayout = {
  role: ImageRole;
  width: number;
  height: number;
  allowsMarketingCopy: boolean;
};

export type ExportImageFormat = 'png' | 'jpg';

export type RenderExportImageInput = {
  source: Buffer;
  role: ImageRole;
  copy: string;
  format: ExportImageFormat;
  direct?: boolean;
  width?: number;
  height?: number;
};

export function getDefaultLayout(role: ImageRole): ImageLayout {
  return {
    role,
    width: EXPORT_SIZE,
    height: EXPORT_SIZE,
    allowsMarketingCopy: role !== 'main',
  };
}

const PLATFORM_RULES: Record<string, string> = {
  amazon_us:
    'Amazon US：主图必须使用纯白色（#FFFFFF）背景，只展示已确认的商品或套装，完整呈现商品，不得添加道具、边框、徽章、水印或文字。',
  shopify:
    'Shopify 店铺：商品必须是画面主体，构图保持简洁，画面展示的所有用途都必须符合已提供的商品事实。',
  tiktok_shop:
    'TikTok Shop：采用清晰、移动端优先的构图，让商品可以被立即识别，不得出现缺乏依据的性能或认证声明。',
};

const ROLE_DIRECTIONS: Partial<Record<ImageRole, string>> = {
  main: '生成干净的纯白背景商品主图。不得出现文字、图形、道具、手、额外包装或装饰性场景。',
  feature_1:
    '功能卖点图 1：突出最核心且证据最充分的购买理由，商品保持大面积主体，并为标题留出负空间。',
  feature_2:
    '功能卖点图 2：解释第二个不同的已验证功能或工作原理，可使用局部放大构图，但不得复制功能图 1。',
  feature_3:
    '功能卖点图 3：展示真实结构、材质、操作或配件带来的不同价值，构图必须与前两张功能图明显不同。',
  feature_4:
    '功能卖点图 4：展示另一个有证据的卖点、使用步骤或包装内容；没有足够事实时采用保守的真实细节表达，不得编造参数。',
  lifestyle_1:
    '场景图 1：把商品放入最典型、已确认且比例真实的使用环境，商品必须清晰可辨，不得只是包装和配件陈列。',
  lifestyle_2:
    '场景图 2：使用不同视角、距离或另一种已确认的使用情境，不能重复场景图 1 的背景与构图。',
  lifestyle_3:
    '场景图 3：用更具氛围感但仍真实的构图展示商品与环境的关系，不得暗示未经验证的用途、性能或适用环境。',
  detail:
    '生成准确的局部特写，突出参考图中真实可见的材质、表面、接口或结构细节，不得虚构内部零件。',
};

export type ImagePromptInput = {
  role: ImageRole;
  targetPlatform: string;
  targetLocale: string;
  analysis: ProductAnalysisResult;
  productReferenceCount: number;
  styleReferenceCount: number;
};

export function buildImagePrompt(input: ImagePromptInput): string {
  const plan = input.analysis.imagePlan.find(
    (item) => item.role === input.role,
  );
  if (!plan) throw new Error(`缺少 ${input.role} 对应的图片方案`);
  const productFacts = input.analysis.sellingPoints
    .map((point) => `${point.zh || point.en}（证据：${point.evidence}）`)
    .join('; ');
  return [
    '请使用提供的图片作为视觉参考，生成一张正方形电商商品图。',
    `前 ${input.productReferenceCount} 张图片是真实商品的权威参考。必须准确保持商品身份，包括颜色、几何形状、比例、材质外观、Logo 与标记、数量、组成部件和配件。`,
    input.styleReferenceCount > 0
      ? `最后 ${input.styleReferenceCount} 张图片仅用于参考视觉风格，绝不能复制其中的商品，也不能用其中的商品替换真实商品。`
      : '没有单独提供风格参考图，请采用克制、高级的电商摄影风格。',
    ROLE_DIRECTIONS[input.role],
    PLATFORM_RULES[input.targetPlatform] ?? PLATFORM_RULES.shopify,
    `策划目标：${plan.objective}`,
    `视觉方向：${plan.visualDirection}`,
    `已验证的商品事实：${productFacts || '只能使用商品参考图中肉眼可验证的细节。'}`,
    `输出地区语境：${input.targetLocale}。`,
    '画面中不得生成任何单词、字母、数字、标签、标注、徽章、水印或界面元素。营销文案将由确定性模板在后续添加。',
    '不得虚构功能、尺寸、材质、认证、配件、包装或营销声明。如有不确定之处，应保持参考商品原貌并简化周围场景。',
  ].join('\n');
}

export function marketingCopyForRole(
  analysis: ProductAnalysisResult,
  role: ImageRole,
): string {
  if (role === 'main') return '';
  return (
    analysis.imagePlan.find((item) => item.role === role)?.copyEn.trim() ?? ''
  );
}

export function buildMarketingOverlay(
  role: ImageRole,
  copy: string,
): Buffer | undefined {
  const normalized = copy.replace(/\s+/g, ' ').trim();
  const roleKind = imageRoleKind(role);
  if (roleKind === 'main' || !normalized) return undefined;
  const settings = {
    feature: {
      maxChars: 28,
      maxLines: 3,
      x: 128,
      y: 1515,
      lineHeight: 98,
      fontSize: 78,
      color: '#ffffff',
      background:
        '<defs><linearGradient id="panel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#171412" stop-opacity="0"/><stop offset="0.28" stop-color="#171412" stop-opacity="0.75"/><stop offset="1" stop-color="#171412" stop-opacity="0.92"/></linearGradient></defs><rect x="0" y="1240" width="2048" height="808" fill="url(#panel)"/>',
    },
    lifestyle: {
      maxChars: 25,
      maxLines: 3,
      x: 150,
      y: 208,
      lineHeight: 88,
      fontSize: 68,
      color: '#201b19',
      background:
        '<rect x="96" y="96" width="1140" height="410" rx="38" fill="#ffffff" fill-opacity="0.9"/>',
    },
    detail: {
      maxChars: 30,
      maxLines: 2,
      x: 150,
      y: 1700,
      lineHeight: 94,
      fontSize: 72,
      color: '#201b19',
      background:
        '<rect x="96" y="1530" width="1856" height="398" rx="38" fill="#ffffff" fill-opacity="0.92"/><rect x="96" y="1530" width="18" height="398" rx="9" fill="#d65f50"/>',
    },
  }[roleKind];
  const lines = wrapCopy(normalized, settings.maxChars, settings.maxLines);
  const tspans = lines
    .map(
      (line, index) =>
        `<tspan x="${settings.x}" dy="${index === 0 ? 0 : settings.lineHeight}">${escapeXml(line)}</tspan>`,
    )
    .join('');
  return Buffer.from(
    `<svg width="${EXPORT_SIZE}" height="${EXPORT_SIZE}" viewBox="0 0 ${EXPORT_SIZE} ${EXPORT_SIZE}" xmlns="http://www.w3.org/2000/svg">${settings.background}<text x="${settings.x}" y="${settings.y}" fill="${settings.color}" font-family="Arial, Helvetica, sans-serif" font-size="${settings.fontSize}" font-weight="700" letter-spacing="-1">${tspans}</text></svg>`,
  );
}

export async function renderExportImage(
  input: RenderExportImageInput,
): Promise<Buffer> {
  let image = sharp(input.source)
    .rotate()
    .flatten({ background: '#ffffff' })
    .resize(input.width ?? EXPORT_SIZE, input.height ?? EXPORT_SIZE, {
      fit: 'cover',
      position: 'centre',
    });
  const overlay = input.direct
    ? undefined
    : buildMarketingOverlay(input.role, input.copy);
  if (overlay) image = image.composite([{ input: overlay }]);
  return input.format === 'png'
    ? image.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer()
    : image
        .jpeg({ quality: 92, chromaSubsampling: '4:4:4', mozjpeg: true })
        .toBuffer();
}

function wrapCopy(copy: string, maxChars: number, maxLines: number): string[] {
  const words = copy.split(' ');
  const lines: string[] = [];
  for (const word of words) {
    const current = lines.at(-1);
    if (!current) {
      lines.push(word);
      continue;
    }
    if (`${current} ${word}`.length <= maxChars) {
      lines[lines.length - 1] = `${current} ${word}`;
    } else if (lines.length < maxLines) {
      lines.push(word);
    } else {
      lines[lines.length - 1] = `${current} ${word}`;
    }
  }
  if (lines.length === maxLines && lines[maxLines - 1]!.length > maxChars) {
    lines[maxLines - 1] =
      `${lines[maxLines - 1]!.slice(0, maxChars - 1).trimEnd()}…`;
  }
  return lines.slice(0, maxLines);
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;',
    };
    return entities[character] as string;
  });
}
