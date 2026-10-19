// Adapted catalogue from vendor/ecom-details-image; original snapshot and hashes retained there.
export const skillTemplates = [
  {
    id: 'hero-image',
    name: '白底/纯色底产品主图',
    keywords: [
      '白底图',
      '主图',
      'hero image',
      '白背景',
      'product shot',
      'packshot',
      '产品照',
      '商品主图',
    ],
    trigger_phrases: [
      '产品主图',
      '白底图',
      '白背景产品',
      'hero image',
      '电商主图',
      '纯色背景',
    ],
    prompt_template: {
      type: 'product photography',
      subject: '{product_description}',
      background: 'clean white background',
      lighting: 'soft diffused studio lighting, even illumination',
      composition: 'centered, front view',
      quality: '8K, commercial e-commerce photography',
    },
    defaults: {
      background: 'clean white background',
      lighting: 'soft diffused studio lighting',
      composition: 'centered, front view',
    },
    variants: {
      luxury: {
        description: '高端奢侈品风格',
        overrides: {
          lighting: 'Rembrandt lighting, subtle rim light',
          background: 'gradient from dark to light, premium feel',
        },
      },
      fresh: {
        description: '清新自然风格',
        overrides: {
          lighting: 'bright natural light',
          background: 'light pastel tones',
        },
      },
      tech: {
        description: '科技感风格',
        overrides: {
          lighting: 'dramatic side lighting',
          background: 'dark minimalist',
        },
      },
      color: {
        description: '彩色背景风格',
        overrides: {
          background: '{color} gradient background',
        },
      },
    },
    category_tips: {
      beauty: 'emphasize texture and glow, show formula details',
      electronics: 'highlight metallic finish, screen details, port precision',
      food: 'vibrant colors, fresh appearance, show texture',
      fashion: 'show fabric texture, drape quality, stitching details',
      home: 'show material quality, craftsmanship, lifestyle appeal',
      jewelry: 'macro detail, sparkle and cut quality, luxurious lighting',
    },
    examples: [
      '{product}, professional product photography on clean white background, soft diffused studio lighting, centered, 8K, commercial e-commerce photography, no shadows, no props',
      '{product} on pure white seamless background, bright commercial studio lighting, centered, 3/4 profile, high resolution, marketplace ready, {material_description}',
      '{product} floating slightly above white surface, softbox overhead, sharp rim light on edges, professional packshot, 8K, ultra-detailed textures',
    ],
    anti_ai_tips: '',
    supports_image_reference: true,
  },
  {
    id: 'lifestyle-scene',
    name: '场景化生活图',
    keywords: [
      '场景图',
      '生活图',
      'lifestyle',
      '使用场景',
      '生活场景',
      '场景化',
      'lifestyle photography',
    ],
    trigger_phrases: [
      '场景图',
      '生活图',
      '使用场景图',
      'lifestyle photo',
      '产品场景',
      '生活化展示',
    ],
    prompt_template: {
      type: 'lifestyle product photography',
      subject: '{product_description}',
      setting: '{scene_description}',
      lighting: 'natural {time_of_day} light',
      composition: '{composition_style}',
      mood: '{mood_description}',
      quality: '8K, editorial lifestyle photography',
    },
    defaults: {
      setting: 'modern living space, clean and organized',
      lighting: 'natural morning light through window',
      composition: 'rule of thirds, product as focal point',
      mood: 'warm and inviting',
    },
    variants: {
      morning: {
        description: '早晨清新氛围',
        overrides: {
          setting: 'bright room with sunlight streaming through window',
          lighting: 'soft morning golden light, visible dust particles',
          mood: 'fresh, clean, new beginning',
        },
      },
      cozy: {
        description: '温馨舒适氛围',
        overrides: {
          setting: 'warm cozy interior, soft textiles, candles',
          lighting: 'warm ambient lighting, soft golden tones',
          mood: 'comfortable, intimate',
        },
      },
      outdoor: {
        description: '户外自然场景',
        overrides: {
          setting: 'outdoor natural setting, organic elements',
          lighting: 'golden hour natural sunlight',
          mood: 'natural, free, adventurous',
        },
      },
      luxury: {
        description: '奢华高端场景',
        overrides: {
          setting: 'luxury spa/hotel, marble and gold fixtures',
          lighting: 'cinematic lighting, warm color grading',
          mood: 'premium, sophisticated',
        },
      },
    },
    category_tips: {
      beauty: 'bathroom vanity with botanical elements, skincare ritual feel',
      electronics: 'modern desk setup, minimal aesthetic, tech-forward',
      food: 'kitchen counter or dining table, fresh ingredients, warm tones',
      fashion: 'urban street or boutique fitting room, model wearing the item',
      home: 'styled room interior, product naturally placed',
    },
    examples: [
      '{product} naturally placed in {scene}, morning sunlight through window, botanical touches, warm atmosphere, professional lifestyle photography, 8K',
      'Cinematic luxury interior with marble walls and gold fixtures. {product} prominently displayed. Morning sunlight through frosted glass. Fresh flowers. Cinematic depth of field, warm color grading, 8K',
      '{product} in cozy setting, warm ambient lighting, soft textiles, golden hour tones, lifestyle photography, authentic atmosphere',
    ],
    anti_ai_tips: '',
    supports_image_reference: true,
  },
  {
    id: 'flat-lay',
    name: '平铺图',
    keywords: ['平铺图', 'flat lay', '俯拍', 'top-down', 'flatlay', '俯视图'],
    trigger_phrases: [
      '平铺图',
      'flat lay',
      '俯拍',
      'top-down view',
      '产品平铺',
    ],
    prompt_template: {
      type: 'flat lay photography, top-down view',
      subject: '{product_description} as hero at bottom center',
      props: '{prop_list}',
      background: '{background_material}',
      color_palette: '{color_scheme}',
      lighting: 'soft natural window light from top-left at 45 degrees',
      quality: '8K, editorial photography, no text, no watermark',
    },
    defaults: {
      props: 'carefully curated complementary objects',
      background: 'ivory linen texture',
      color_palette: 'ivory, blush, champagne gold, sage green',
    },
    variants: {
      luxury: {
        description: '奢华仪式感',
        overrides: {
          props:
            'gold foil flakes, pearl beads, dried flowers, silk ribbon, leather journal',
          background: 'ivory linen with subtle shadow from sheer curtains',
          color_palette: 'ivory, blush pink, champagne gold, soft cream',
        },
      },
      minimal: {
        description: '极简风格',
        overrides: {
          props: 'only 2-3 essential items, clean lines',
          background: 'clean white surface',
          color_palette: 'white, gray, one accent color',
        },
      },
      seasonal: {
        description: '季节主题',
        overrides: {
          props: 'seasonal elements matching theme',
          color_palette: 'season-appropriate color scheme',
        },
      },
    },
    category_tips: {
      beauty:
        'skincare ritual flat lay, open product showing formula, botanical elements',
      food: 'ingredients spread, fresh produce, kitchen tools',
      fashion:
        'clothing + accessories + shoes arranged aesthetically, fabric textures',
      home: 'decor items, textures, materials spread showing lifestyle',
    },
    examples: [
      'Luxurious {category} ritual flat lay, top-down photography. {product} with lid open showing texture as hero at bottom center. Surrounding: gold-tone palette, crystal bottle, dried lavender with silk ribbon, gold foil flakes, pearl beads. Background: ivory linen. Color: ivory, blush, champagne gold. Soft window light top-left at 45 degrees. 8K, no text, no watermark',
      '{product} flat lay top-down as hero. Surrounding: {props}. {background} background. Color: {colors}. Soft window light top-left. Clean aesthetic, 8K',
      'Professional {category} flat lay, top-down editorial. {product} centered with curated objects. {background} background. Strict color control. 8K, magazine quality, no text',
    ],
    anti_ai_tips: '',
    supports_image_reference: true,
  },
  {
    id: 'detail-macro',
    name: '细节微距图',
    keywords: [
      '细节图',
      '微距',
      'macro',
      '特写',
      'close-up',
      'detail shot',
      '细节展示',
    ],
    trigger_phrases: [
      '细节图',
      '微距图',
      '产品特写',
      '材质特写',
      'detail shot',
      'macro photography',
    ],
    prompt_template: {
      type: 'macro product photography',
      subject: '{product_description}, extreme close-up on {focus_area}',
      detail: 'visible {texture_description}',
      lighting: '{lighting_style}',
      camera: 'shot with {camera_setup}',
      quality: 'ultra macro detail, 8K, professional product photography',
    },
    defaults: {
      focus_area: 'texture and material quality',
      detail: 'fine texture, material grain, surface quality',
      lighting: 'soft directional lighting highlighting texture',
      camera: 'dedicated macro lens setup',
    },
    variants: {
      texture: {
        description: '材质纹理展示',
        overrides: {
          focus_area: 'material surface showing grain and quality',
        },
      },
      formula: {
        description: '产品配方展示',
        overrides: {
          focus_area: 'product formula showing cream/liquid texture',
          detail: 'formula consistency, light reflection',
        },
      },
      craftsmanship: {
        description: '工艺细节展示',
        overrides: {
          focus_area: 'stitching, joints, edges, manufacturing precision',
        },
      },
    },
    category_tips: {
      beauty: 'show cream formula texture, shimmer particles, light reflection',
      electronics: 'show port precision, material finish, button detail',
      food: 'show ingredient texture, cross-section, freshness',
      fashion: 'show fabric weave, stitching quality, hardware detail',
      jewelry: 'show gemstone cut, metal finish, clasp detail',
    },
    examples: [
      'Extreme close-up beauty macro, Canon EOS R5 100mm f/2.8 macro. {product} filling 80% of frame, focusing on {focus_area}. Visible pores, fine lines, natural imperfections, NOT retouched. Formula visible with realistic light reflection. Natural side lighting. 8K',
      'Cinematic {category} close-up. {product} detail showing {texture_description}. Formula/texture visible between fingertips with subtle light reflection. Soft blur background. Dramatic side lighting, warm tones, 8K',
      'Macro detail of {product}, Sony A7R V 90mm macro, focus stacking. Extreme detail showing {focus_area}. Professional product photography, 8K',
    ],
    anti_ai_tips:
      'For hand shots: specify real skin (visible knuckle lines, slight dryness on cuticles, natural warm tone). NOT retouched or smoothed.',
    supports_image_reference: true,
  },
  {
    id: 'infographic',
    name: '信息图/A+Content',
    keywords: [
      '信息图',
      'infographic',
      'A+',
      '详情页',
      '卖点图',
      '产品信息图',
      '产品详情',
    ],
    trigger_phrases: [
      '信息图',
      '产品信息图',
      '详情页图',
      'A+Content',
      '卖点图',
      'infographic',
    ],
    prompt_template: {
      type: 'e-commerce product infographic',
      subject: '{product_description}',
      features: '{feature_list}',
      layout: 'structured sections with clear hierarchy',
      data_vis: '{data_elements}',
      color_scheme: '{brand_colors}',
      quality: 'professional e-commerce design, mobile-friendly',
    },
    defaults: {
      features: '4-6 key features with icons and descriptions',
      layout: 'clean grid, product as focal point',
      data_vis: 'simple charts or comparison tables',
      color_scheme: 'brand-consistent palette',
    },
    variants: {
      'amazon-a-plus': {
        description: '亚马逊A+风格',
        overrides: {
          layout:
            '4-quadrant module with banner, feature blocks, comparison, badges',
          data_vis: 'comparison table, ingredient chart, certification badges',
        },
      },
      'feature-grid': {
        description: '卖点网格',
        overrides: {
          layout: 'product centered with callout lines to feature blocks',
        },
      },
      'story-flow': {
        description: '故事线信息流',
        overrides: {
          layout: 'vertical story: problem → solution → features → results',
        },
      },
    },
    category_tips: {
      beauty:
        'ingredient breakdown with %, before/after data, dermatologist badges',
      electronics: 'spec comparison, performance metrics, compatibility icons',
      food: 'nutritional visualization, ingredient sourcing, recipe flow',
      fashion: 'size guide, material composition, care instructions',
    },
    examples: [
      'Complex Amazon A+ Content module. Top banner with brand and tagline. Main: 4 quadrants each showing product detail with labeled feature: (1) {f1}, (2) {f2}, (3) {f3}, (4) {f4}. Below: comparison table. Bottom: spec chart and certification badges. {color} palette. Mobile-first, professional e-commerce, 2000x2500px',
      'Product infographic. Left: {product} on gradient. Right: {n} feature blocks with icons vertically, callout lines connecting to product. Clean modern, {color} accents, 2000x2000px',
      '{category} specification guide. Product centered with dimension callouts. Feature highlights with icons. Data visualization. Clean typography, mobile-friendly, 2000x2000px',
    ],
    anti_ai_tips: '',
    supports_image_reference: true,
  },
  {
    id: 'size-spec',
    name: '尺寸规格+使用步骤图',
    keywords: [
      '尺寸',
      '规格',
      '尺寸图',
      '使用步骤',
      '规格图',
      'dimension',
      'how to use',
      '使用指南',
    ],
    trigger_phrases: [
      '尺寸图',
      '规格图',
      '使用步骤图',
      '尺寸标注',
      'how to use',
      '使用指南',
      '产品规格',
    ],
    prompt_template: {
      type: 'product specification and usage guide infographic',
      subject: '{product_description}',
      dimensions: '{size_annotations}',
      steps: '{usage_steps}',
      extras: '{additional_info}',
      style: 'clean professional layout',
      quality: 'professional e-commerce infographic',
    },
    defaults: {
      dimensions: 'height, width with measurement lines and arrows',
      steps: '3-4 step numbered usage guide with icons',
      extras: 'ingredient highlights or feature badges',
      style: 'clean white, professional typography',
    },
    variants: {
      'premium-editorial': {
        description: '高端杂志风格',
        overrides: {
          style:
            'luxury editorial with decorative elements, gold accents, premium typography',
        },
      },
      technical: {
        description: '技术规格风格',
        overrides: {
          dimensions: 'detailed specs with reference objects for scale',
          extras: 'comparison charts, certification badges, data grids',
        },
      },
      'ritual-guide': {
        description: '使用仪式指南',
        overrides: {
          steps: 'decorative numbered ritual guide with small illustrations',
        },
      },
    },
    category_tips: {
      beauty:
        'dimension callout badge, usage ritual steps, ingredient percentages',
      electronics: 'precise dimensions with comparison objects, port specs',
      food: 'serving size, preparation steps, nutritional highlights',
      fashion: 'size chart with body measurements, care instructions',
    },
    examples: [
      'Premium {category} specification and ritual guide, luxury editorial. White background, subtle border. Top: {product} centered with dimension badge. Left: 4-step usage guide with decorative icons. Right: highlights with colored pills. Bottom: {data}. Decorative corner accents. Magazine-quality, 2000x2800px',
      'Product detail card. Left: {product} with dimension annotations {measurements}, arrows and lines. Right: {n}-step usage guide with icons. White background, minimal, professional, 2000x1500px',
      '{category} specification card. {product} with detailed dimensions and reference object. Usage steps with icons. Key features. Clean layout, mobile-friendly, 2000x2000px',
    ],
    anti_ai_tips: '',
    supports_image_reference: true,
  },
  {
    id: 'multi-product',
    name: '多产品套装/组合展示',
    keywords: [
      '套装',
      '组合',
      '多产品',
      'bundle',
      'gift set',
      '礼盒',
      '系列展示',
    ],
    trigger_phrases: [
      '套装图',
      '多产品展示',
      '产品组合',
      'bundle image',
      '礼盒展示',
      '系列图',
      'gift set',
    ],
    prompt_template: {
      type: 'multi-product bundle photography',
      subject: '{product_set_description}',
      arrangement: 'organized composition, all products clearly visible',
      background: '{background_description}',
      decorative: '{decorative_elements}',
      quality: 'professional product photography, 8K',
    },
    defaults: {
      arrangement: 'organized with consistent spacing, all visible, no overlap',
      background: 'clean suitable for showcase',
      decorative: 'luxury elements for gift-ready presentation',
    },
    variants: {
      'gift-set': {
        description: '礼盒套装',
        overrides: {
          arrangement: 'products in gift box with cards',
          decorative: 'satin ribbon, gold foil, dried flowers, pearls',
        },
      },
      'routine-set': {
        description: '使用程序套装',
        overrides: {
          arrangement: 'products in order of use, step indicators',
        },
      },
      lineup: {
        description: '产品线排列',
        overrides: {
          arrangement: 'neat row, hero centered and larger',
          decorative: 'minimal, clean',
          background: 'white seamless',
        },
      },
    },
    category_tips: {
      beauty: 'complete routine (cleanser → toner → serum → cream), gift-ready',
      food: 'product range, variety pack, flavor assortment',
      fashion: 'outfit coordination pieces, colorway options',
      home: 'collection of coordinating items',
    },
    examples: [
      'Luxury {category} gift set on premium surface: {product_list}. Organized composition with product cards. Scattered: gold foil, pearls, dried flowers, velvet ribbon. Bottom left: set description. Bottom right: price with original crossed out. Soft directional lighting, premium photography, 8K',
      'Premium {category} routine set. Main product centered, lid open showing texture. Surrounding: routine products arranged naturally. Soft background, decorative elements. Warm studio lighting, gift-ready, 2000x2000px',
      '{category} gift set display. {n} products neat row, consistent spacing. Clean photography, soft shadows, professional bundle image, no text, 2000x2000px',
    ],
    anti_ai_tips: '',
    supports_image_reference: true,
  },
] as const;
