'use client';

import type { ProductAnalysisResult } from '../../lib/api';
import type { ImageRole } from '@image-set/shared';

const ROLE_LABELS: Record<ImageRole, string> = {
  main: '白底主图',
  feature_1: '功能卖点图 1',
  feature_2: '功能卖点图 2',
  feature_3: '功能卖点图 3',
  feature_4: '功能卖点图 4',
  lifestyle_1: '使用场景图 1',
  lifestyle_2: '使用场景图 2',
  lifestyle_3: '使用场景图 3',
  detail: '材质 / 细节图',
};

function lines(value: string): string[] {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function AnalysisEditor({
  value,
  disabled,
  onChange,
  onSave,
  onReanalyze,
}: {
  value: ProductAnalysisResult;
  disabled: boolean;
  onChange: (value: ProductAnalysisResult) => void;
  onSave: () => void;
  onReanalyze: () => void;
}) {
  function update(mutator: (draft: ProductAnalysisResult) => void) {
    const next = structuredClone(value);
    mutator(next);
    onChange(next);
  }

  return (
    <section className="analysis-card">
      <div className="section-head analysis-heading">
        <div>
          <p className="eyebrow">AI PRODUCT ANALYSIS</p>
          <h2>双语商品信息</h2>
          <p>所有内容都可编辑；保存文字不会扣费。</p>
        </div>
        <div className="action-row">
          <button
            type="button"
            className="ghost"
            disabled={disabled}
            onClick={onReanalyze}
          >
            重新分析 · 1 额度
          </button>
          <button
            type="button"
            className="primary"
            disabled={disabled}
            onClick={onSave}
          >
            {disabled ? '处理中…' : '保存修改'}
          </button>
        </div>
      </div>

      <div className="analysis-section">
        <h3>商品名称</h3>
        <BilingualFields
          value={value.productName}
          onChange={(next) => update((draft) => (draft.productName = next))}
        />
      </div>
      <div className="analysis-section">
        <h3>商品标题</h3>
        <BilingualFields
          value={value.title}
          multiline
          onChange={(next) => update((draft) => (draft.title = next))}
        />
      </div>
      <div className="analysis-section">
        <h3>关键词</h3>
        <div className="field-grid">
          <label>
            English（每行一个）
            <textarea
              rows={5}
              value={value.keywords.map((item) => item.en).join('\n')}
              onChange={(event) => {
                const english = lines(event.target.value);
                update((draft) => {
                  draft.keywords = english.map((en, index) => ({
                    en,
                    zh: draft.keywords[index]?.zh ?? en,
                  }));
                });
              }}
            />
          </label>
          <label>
            中文（与英文逐行对应）
            <textarea
              rows={5}
              value={value.keywords.map((item) => item.zh).join('\n')}
              onChange={(event) => {
                const chinese = lines(event.target.value);
                update((draft) => {
                  draft.keywords = draft.keywords.map((item, index) => ({
                    ...item,
                    zh: chinese[index] ?? item.zh,
                  }));
                });
              }}
            />
          </label>
        </div>
      </div>
      <div className="analysis-section">
        <h3>卖点与依据</h3>
        <div className="selling-points">
          {value.sellingPoints.map((point, index) => (
            <article key={index} className="selling-point">
              <BilingualFields
                value={point}
                multiline
                onChange={(next) =>
                  update((draft) => {
                    const current = draft.sellingPoints[index];
                    if (current) Object.assign(current, next);
                  })
                }
              />
              <label>
                事实依据
                <textarea
                  rows={2}
                  value={point.evidence}
                  onChange={(event) =>
                    update((draft) => {
                      const current = draft.sellingPoints[index];
                      if (current) current.evidence = event.target.value;
                    })
                  }
                />
              </label>
            </article>
          ))}
        </div>
      </div>
      <div className="analysis-section">
        <h3>商品描述</h3>
        <BilingualFields
          value={value.description}
          multiline
          onChange={(next) => update((draft) => (draft.description = next))}
        />
      </div>
      <div className="analysis-section field-grid">
        <label>
          信息缺口（每行一个）
          <textarea
            rows={4}
            value={value.missingInformation.join('\n')}
            onChange={(event) =>
              update(
                (draft) =>
                  (draft.missingInformation = lines(event.target.value)),
              )
            }
          />
        </label>
        <label>
          合规风险（每行一个）
          <textarea
            rows={4}
            value={value.complianceFlags.join('\n')}
            onChange={(event) =>
              update(
                (draft) => (draft.complianceFlags = lines(event.target.value)),
              )
            }
          />
        </label>
      </div>
      <div className="analysis-section">
        <h3>默认四图规划</h3>
        <div className="plan-grid">
          {value.imagePlan.map((plan, index) => (
            <article className="plan-card" key={plan.role}>
              <strong>{ROLE_LABELS[plan.role]}</strong>
              <label>
                目标
                <textarea
                  rows={2}
                  value={plan.objective}
                  onChange={(event) =>
                    update((draft) => {
                      const current = draft.imagePlan[index];
                      if (current) current.objective = event.target.value;
                    })
                  }
                />
              </label>
              <label>
                视觉方向
                <textarea
                  rows={3}
                  value={plan.visualDirection}
                  onChange={(event) =>
                    update((draft) => {
                      const current = draft.imagePlan[index];
                      if (current) current.visualDirection = event.target.value;
                    })
                  }
                />
              </label>
              {plan.role !== 'main' && (
                <BilingualFields
                  value={{ en: plan.copyEn, zh: plan.copyZh }}
                  onChange={(next) =>
                    update((draft) => {
                      const current = draft.imagePlan[index];
                      if (current) {
                        current.copyEn = next.en;
                        current.copyZh = next.zh;
                      }
                    })
                  }
                />
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function BilingualFields({
  value,
  multiline = false,
  onChange,
}: {
  value: { en: string; zh: string };
  multiline?: boolean;
  onChange: (value: { en: string; zh: string }) => void;
}) {
  const Element = multiline ? 'textarea' : 'input';
  return (
    <div className="field-grid">
      <label>
        English
        <Element
          {...(multiline ? { rows: 3 } : {})}
          value={value.en}
          onChange={(event) => onChange({ ...value, en: event.target.value })}
        />
      </label>
      <label>
        中文
        <Element
          {...(multiline ? { rows: 3 } : {})}
          value={value.zh}
          onChange={(event) => onChange({ ...value, zh: event.target.value })}
        />
      </label>
    </div>
  );
}
