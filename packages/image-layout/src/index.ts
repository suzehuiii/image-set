import type { ImageRole, ProductAnalysisResult } from '@image-set/shared';

export const EXPORT_SIZE = 2048;

export type ImageLayout = {
  role: ImageRole;
  width: number;
  height: number;
  allowsMarketingCopy: boolean;
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
