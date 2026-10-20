'use client';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DEFAULT_CAMPAIGN_CONFIG,
  supportedLocales,
  outputLocale,
  campaignRoles,
  type ProductBriefAnalysis,
  type CampaignConfig,
  type Campaign,
} from '@image-set/shared';
import { api } from '../../lib/api';

type Group =
  'functions' | 'sellingPoints' | 'audience' | 'scenes' | 'specifications';
const groups: Group[] = [
  'functions',
  'sellingPoints',
  'audience',
  'scenes',
  'specifications',
];
const fieldLabels: Record<string, string[]> = {
  zh: [
    '是什么商品',
    '主要功能',
    '核心卖点',
    '目标人群',
    '使用场景',
    '关键规格与限制',
  ],
  en: [
    'Product identity',
    'Functions',
    'Selling points',
    'Audience',
    'Usage scenarios',
    'Specifications and limits',
  ],
  ja: [
    '商品情報',
    '主な機能',
    'セールスポイント',
    '対象ユーザー',
    '使用シーン',
    '仕様と制限',
  ],
  de: [
    'Produkt',
    'Funktionen',
    'Verkaufsargumente',
    'Zielgruppe',
    'Anwendung',
    'Spezifikationen',
  ],
  fr: [
    'Produit',
    'Fonctions',
    'Arguments de vente',
    'Public cible',
    'Utilisations',
    'Spécifications',
  ],
  es: [
    'Producto',
    'Funciones',
    'Ventajas',
    'Público objetivo',
    'Usos',
    'Especificaciones',
  ],
  it: [
    'Prodotto',
    'Funzioni',
    'Vantaggi',
    'Destinatari',
    'Utilizzi',
    'Specifiche',
  ],
  ko: [
    '상품 정보',
    '기능',
    '판매 포인트',
    '대상 고객',
    '사용 환경',
    '사양 및 제한',
  ],
  pt: [
    'Produto',
    'Funções',
    'Diferenciais',
    'Público',
    'Cenários',
    'Especificações',
  ],
};
export function BriefEditor({
  value,
  view = 'brief',
  planContainer,
  onConfirmed,
  disabled,
  dirty,
  projectId,
  platform,
  balance,
  onChange,
  onSave,
  onReanalyze,
  onPlanned,
}: {
  value: ProductBriefAnalysis;
  view?: 'brief' | 'plan';
  planContainer?: HTMLElement | null;
  onConfirmed?: () => void;
  disabled: boolean;
  dirty: boolean;
  projectId: string;
  platform: string;
  balance: number;
  onChange: (value: ProductBriefAnalysis) => void;
  onSave: (value: ProductBriefAnalysis) => Promise<boolean>;
  onReanalyze: () => void;
  onPlanned: () => Promise<void>;
}) {
  const zh = value.analysisLocale.startsWith('zh');
  const labels =
    fieldLabels[value.analysisLocale.split('-')[0]!] ?? fieldLabels.en!;
  const [config, setConfig] = useState<CampaignConfig>(
    value.campaign?.config ?? DEFAULT_CAMPAIGN_CONFIG,
  );
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState('');
  function update(mutator: (next: ProductBriefAnalysis) => void, brief = true) {
    const next = structuredClone(value);
    mutator(next);
    if (brief) {
      next.confirmed = false;
      next.campaign = null;
    } else if (next.campaign) next.campaign.confirmed = false;
    onChange(next);
  }
  async function confirmBrief() {
    if (value.confirmed && !dirty) {
      onConfirmed?.();
      return;
    }
    const next = structuredClone(value);
    next.product.confirmed = true;
    for (const group of groups)
      for (const item of next[group])
        if (item.source !== 'suggestion') item.confirmed = true;
    next.confirmed = true;
    next.campaign = null;
    if (await onSave(next)) onConfirmed?.();
  }
  async function plan() {
    setPlanning(true);
    setError('');
    try {
      await api(`/projects/${projectId}/plan`, {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ config }),
      });
      await onPlanned();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Planning failed');
    } finally {
      setPlanning(false);
    }
  }
  const blocked = disabled || planning;
  const sourceLabels: Record<string, string> = zh
    ? {
        image: '图片可见',
        manual: '说明书',
        user: '用户提供',
        suggestion: 'AI 建议，勾选后才用于策划',
      }
    : {
        image: 'Image',
        manual: 'Manual',
        user: 'User',
        suggestion: 'AI suggestion — select to include',
      };
  function editCampaign(
    index: number,
    key: 'objective' | 'composition' | 'copy',
    text: string,
  ) {
    update((next) => {
      const image = next.campaign?.images[index];
      if (image) image[key] = text;
    }, false);
  }
  return (
    <section className="analysis-card" aria-busy={blocked}>
      <div className="section-head" hidden={view !== 'brief'}>
        <div>
          <h2>{zh ? '商品简报' : 'Product brief'}</h2>
          <p>
            {zh
              ? '检查提取结果，修改后确认。未经确认的 AI 建议不会用于图片。'
              : 'Review the extracted information. Unconfirmed suggestions are excluded.'}{' '}
            · {value.analysisLocale}
          </p>
        </div>
        <button className="ghost" disabled={blocked} onClick={onReanalyze}>
          {zh ? '重新分析 · 1 额度' : 'Analyze again · 1 credit'}
        </button>
      </div>
      <fieldset
        hidden={view !== 'brief'}
        disabled={blocked}
        className="brief-fields"
      >
        <label>
          {labels[0]}
          <textarea
            value={value.product.text}
            onChange={(e) =>
              update((next) => {
                next.product.text = e.target.value;
                next.product.source = 'user';
                next.product.confirmed = true;
              })
            }
          />
          <small>
            {sourceLabels[value.product.source]} · {value.product.evidence}
          </small>
        </label>
        {groups.map((group, i) => (
          <section className="analysis-section" key={group}>
            <h3>{labels[i + 1]}</h3>
            {value[group].map((item, index) => (
              <div className="brief-item" key={index}>
                <textarea
                  aria-label={`${labels[i + 1]} ${index + 1}`}
                  value={item.text}
                  onChange={(e) =>
                    update((next) => {
                      const row = next[group][index];
                      if (row) {
                        row.text = e.target.value;
                        row.source = 'user';
                        row.confirmed = true;
                        row.evidence = zh ? '用户编辑确认' : 'Edited by user';
                      }
                    })
                  }
                />
                <small>
                  {sourceLabels[item.source]} · {item.evidence}
                </small>
                <div className="action-row">
                  <label className="inline-check">
                    <input
                      type="checkbox"
                      checked={item.confirmed}
                      onChange={(e) =>
                        update((next) => {
                          const row = next[group][index];
                          if (row) row.confirmed = e.target.checked;
                        })
                      }
                    />
                    {zh ? '采用此项' : 'Include'}
                  </label>
                  <button
                    type="button"
                    className="text-danger"
                    onClick={() =>
                      update((next) => {
                        next[group].splice(index, 1);
                      })
                    }
                  >
                    {zh ? '删除' : 'Remove'}
                  </button>
                </div>
              </div>
            ))}
            <button
              className="ghost"
              onClick={() =>
                update((next) => {
                  next[group].push({
                    text: zh ? '请填写' : 'Enter information',
                    source: 'user',
                    evidence: zh ? '用户补充' : 'User supplied',
                    confirmed: true,
                  });
                })
              }
            >
              {zh ? '添加' : 'Add'}
            </button>
          </section>
        ))}
        <label>
          {zh ? '商品外观与主体身份' : 'Appearance and identity'}
          <textarea
            rows={3}
            value={value.appearance}
            onChange={(e) =>
              update((next) => {
                next.appearance = e.target.value;
              })
            }
          />
        </label>
        {(['accessories', 'packaging', 'forbiddenChanges'] as const).map(
          (key, i) => (
            <label key={key}>
              {
                (zh
                  ? ['包含配件', '包装（不作为主商品）', '禁止改动项']
                  : [
                      'Included accessories',
                      'Packaging (not the primary product)',
                      'Do not change',
                    ])[i]
              }
              <textarea
                value={value[key].join('\n')}
                onChange={(e) =>
                  update((next) => {
                    next[key] = e.target.value.split('\n').filter(Boolean);
                  })
                }
              />
            </label>
          ),
        )}
        {value.missingInformation.length > 0 && (
          <p>
            {zh ? '待补充：' : 'Missing: '}
            {value.missingInformation.join(' · ')}
          </p>
        )}
        {value.warnings.map((warning, i) => (
          <p className="error" key={i}>
            {warning}
          </p>
        ))}
        <button className="primary" onClick={confirmBrief}>
          {value.confirmed && !dirty
            ? zh
              ? '简报已确认 · 查看图片方案'
              : 'Brief confirmed · View image plan'
            : zh
              ? '确认商品事实与选中建议并保存'
              : 'Confirm facts and selected suggestions'}
        </button>
      </fieldset>
      <section
        className="analysis-section planning-settings"
        hidden={view !== 'plan'}
      >
        <h2>{zh ? '图片包与视觉策划' : 'Image pack and visual plan'}</h2>
        <p>
          {zh
            ? '先确认简报，再策划；图片模型直接生成含文案的信息图。'
            : 'Confirm the brief before planning. The image model renders the complete design and copy.'}
        </p>
        <fieldset className="field-grid" disabled={blocked}>
          <label>
            {zh ? '图片包' : 'Image pack'}
            <select
              value={config.pack}
              onChange={(e) =>
                setConfig({
                  ...config,
                  pack: e.target.value as CampaignConfig['pack'],
                })
              }
            >
              <option value="gallery">
                {zh ? '5 张展示图' : '5 gallery images'}
              </option>
              <option value="full">
                {zh ? '展示图＋详情图' : 'Gallery + PDP'}
              </option>
            </select>
          </label>
          {config.pack === 'full' && (
            <label>
              {zh ? '详情数量' : 'PDP count'}
              <select
                value={config.detailCount}
                onChange={(e) =>
                  setConfig({ ...config, detailCount: Number(e.target.value) })
                }
              >
                {[7, 8, 9].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
          )}
          <label>
            {zh
              ? '展示图比例（白底首图固定 1:1）'
              : 'Gallery ratio (hero is 1:1)'}
            <select
              value={config.galleryRatio}
              onChange={(e) =>
                setConfig({
                  ...config,
                  galleryRatio: e.target
                    .value as CampaignConfig['galleryRatio'],
                })
              }
            >
              {['1:1', '4:5', '3:4'].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          {config.pack === 'full' && (
            <label>
              {zh ? '详情图比例' : 'PDP ratio'}
              <select
                value={config.detailRatio}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    detailRatio: e.target
                      .value as CampaignConfig['detailRatio'],
                  })
                }
              >
                {['2:3', '3:4', '4:5'].map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
          )}
          <label>
            {zh ? '目标市场语言' : 'Target market language'}
            <select
              value={outputLocale(platform, config.marketLocale)}
              disabled={platform.startsWith('amazon_')}
              onChange={(e) =>
                setConfig({
                  ...config,
                  marketLocale: e.target
                    .value as CampaignConfig['marketLocale'],
                })
              }
            >
              {supportedLocales.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
        </fieldset>
        <p>
          {campaignRoles(config).length}{' '}
          {zh ? '张图 · 生图预计' : 'images · Generation:'}{' '}
          {campaignRoles(config).length * 3}{' '}
          {zh
            ? '额度；策划另需 1 额度。直接成图改字需要重新生图，单张 3 额度。'
            : 'credits; planning costs 1 credit. Changing rendered text requires regeneration (3 credits/image).'}
        </p>
        <button
          className="primary"
          disabled={blocked || dirty || !value.confirmed || balance < 1}
          onClick={plan}
        >
          {planning
            ? zh
              ? '正在策划…'
              : 'Planning…'
            : zh
              ? '生成图片方案 · 1 额度'
              : 'Create image plan · 1 credit'}
        </button>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {value.campaign && (
          <>
            <label>
              {zh ? '整套风格规范' : 'Campaign Style Lock'}
              <textarea
                rows={4}
                disabled={blocked}
                value={value.campaign.styleLock}
                onChange={(e) =>
                  update((next) => {
                    if (next.campaign) next.campaign.styleLock = e.target.value;
                  }, false)
                }
              />
            </label>
            <p>
              {value.campaign.images.length} · {value.campaign.targetLocale} ·{' '}
              {value.campaign.driver}
            </p>
            {planContainer &&
              createPortal(
                <fieldset disabled={blocked} className="plan-grid">
                  {value.campaign.images.map((image, i) => (
                    <article className="plan-card" key={image.role}>
                      <h3>{image.title}</h3>
                      <small>
                        {image.role} · {image.templateId}
                      </small>
                      <label>
                        {zh ? '目标' : 'Objective'}
                        <textarea
                          value={image.objective}
                          onChange={(e) =>
                            editCampaign(i, 'objective', e.target.value)
                          }
                        />
                      </label>
                      <label>
                        {zh ? '构图' : 'Composition'}
                        <textarea
                          rows={3}
                          value={image.composition}
                          onChange={(e) =>
                            editCampaign(i, 'composition', e.target.value)
                          }
                        />
                      </label>
                      {image.role !== 'gallery_1' && (
                        <label>
                          {zh ? '图片文案' : 'Image copy'}
                          <textarea
                            value={image.copy}
                            onChange={(e) =>
                              editCampaign(i, 'copy', e.target.value)
                            }
                          />
                        </label>
                      )}
                    </article>
                  ))}
                </fieldset>,
                planContainer,
              )}
            <button
              className="primary"
              disabled={blocked}
              onClick={() =>
                onSave({
                  ...value,
                  campaign: { ...value.campaign, confirmed: true } as Campaign,
                })
              }
            >
              {zh ? '确认并保存图片方案' : 'Confirm and save image plan'}
            </button>
          </>
        )}
      </section>
    </section>
  );
}
