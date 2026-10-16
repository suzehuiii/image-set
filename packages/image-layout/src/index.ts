import sharp from 'sharp';
import type { ImageRole, ProductAnalysisResult } from '@image-set/shared';

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
    'Amazon US: for the main image use a pure white (#FFFFFF) background, show only the declared product or set, keep the whole product visible, and do not add props, borders, badges, watermarks, or text.',
  shopify:
    'Shopify storefront: keep the product dominant, the composition clean, and all depicted uses truthful to the supplied product facts.',
  tiktok_shop:
    'TikTok Shop: use a clear mobile-first composition with the product immediately recognizable and no unsupported performance or certification claims.',
};

const ROLE_DIRECTIONS: Record<ImageRole, string> = {
  main: 'Create a clean catalog hero image on a pure white background. No text, graphics, props, hands, packaging additions, or decorative scenery.',
  feature:
    'Create a visual that demonstrates exactly one verified product benefit. Leave intentional negative space for copy that will be added later by the layout system.',
  lifestyle:
    'Place the product in a realistic, scale-consistent use context supported by the product facts. Do not imply unverified uses or performance.',
  detail:
    'Create a precise close-up emphasizing a real material, surface, interface, or construction detail visible in the references. Do not invent internal parts.',
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
  if (!plan) throw new Error(`Missing image plan for role: ${input.role}`);
  const productFacts = input.analysis.sellingPoints
    .map((point) => `${point.en} (evidence: ${point.evidence})`)
    .join('; ');
  return [
    'Create one square ecommerce product image using the supplied images as visual references.',
    `The first ${input.productReferenceCount} image(s) are authoritative product references. Preserve the exact product identity: color, geometry, proportions, material appearance, logo and markings, quantity, included parts, and accessories.`,
    input.styleReferenceCount > 0
      ? `The final ${input.styleReferenceCount} image(s) are style references only. Never copy or replace their products.`
      : 'No separate style reference is supplied; use a restrained premium ecommerce photography style.',
    ROLE_DIRECTIONS[input.role],
    PLATFORM_RULES[input.targetPlatform] ?? PLATFORM_RULES.shopify,
    `Planned objective: ${plan.objective}`,
    `Visual direction: ${plan.visualDirection}`,
    `Verified product facts: ${productFacts || 'Use only visibly verifiable details from the product references.'}`,
    `Output locale context: ${input.targetLocale}.`,
    'Generate the visual without any words, letters, numbers, labels, callouts, badges, watermarks, or UI. Marketing copy is added later by deterministic templates.',
    'Do not invent functions, dimensions, materials, certifications, accessories, packaging, or claims. When uncertain, preserve the reference product and simplify the surrounding scene.',
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
  if (role === 'main' || !normalized) return undefined;
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
  }[role];
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
    .resize(EXPORT_SIZE, EXPORT_SIZE, { fit: 'cover', position: 'centre' });
  const overlay = buildMarketingOverlay(input.role, input.copy);
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
