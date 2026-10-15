const milestones = [
  ['M0', '项目初始化', '已完成'],
  ['M1', '账号、项目与素材', '待开始'],
  ['M2', 'AI 商品分析', '待开始'],
  ['M3–M5', '生成、导出与交付', '待开始'],
];

export default function HomePage() {
  return (
    <main>
      <section className="hero">
        <p className="eyebrow">PRODUCT IMAGE STUDIO</p>
        <h1>商品套图 AI</h1>
        <p className="lede">
          从真实商品图出发，生成适合海外电商的商品信息与标准套图。
        </p>
        <div className="status">
          <span />
          M0 本地开发底座已就绪
        </div>
      </section>
      <section className="panel" aria-labelledby="milestone-heading">
        <div>
          <p className="eyebrow">DEVELOPMENT STATUS</p>
          <h2 id="milestone-heading">MVP 实施进度</h2>
        </div>
        <div className="milestones">
          {milestones.map(([code, name, state]) => (
            <article
              key={code}
              className={state === '已完成' ? 'complete' : ''}
            >
              <strong>{code}</strong>
              <span>{name}</span>
              <small>{state}</small>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
