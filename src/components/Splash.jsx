export default function Splash({ hiding, onStart, onStartMuted }) {
  return (
    <div id="splash" style={hiding ? { opacity: 0, pointerEvents: 'none' } : {}}>
      <div className="splash-inner">
        <p className="splash-eyebrow">K-POP 30년의 기록</p>
        <h1 className="splash-title">한국 가요의 역사</h1>
        <p className="splash-sub">
          서태지와 아이들부터 NewJeans까지<br />
          한국 음악 차트 1위곡과 함께하는 시간 여행
        </p>
        <p className="splash-years">1992 — 2023</p>
        <div className="splash-btns">
          <button className="btn-start primary" onClick={onStart}>▶&nbsp; 재생 시작</button>
          <button className="btn-start secondary" onClick={onStartMuted}>🔇&nbsp; 무음으로 시작</button>
        </div>
        <p className="splash-hint">🎧 헤드폰 착용 권장 &nbsp;·&nbsp; 카드를 클릭하면 해당 곡이 재생됩니다</p>
      </div>
    </div>
  );
}
