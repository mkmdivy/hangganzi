import { useEffect, useRef } from 'react';

export default function Header({ year, title, artist, streak, showStreak }) {
  const yearRef = useRef(null);
  const infoRef = useRef(null);

  useEffect(() => {
    const el = yearRef.current;
    if (!el) return;
    el.classList.remove('np-change');
    void el.offsetWidth;
    el.classList.add('np-change');
  }, [year]);

  useEffect(() => {
    const el = infoRef.current;
    if (!el) return;
    el.classList.remove('np-change');
    void el.offsetWidth;
    el.classList.add('np-change');
  }, [title, artist]);

  return (
    <div id="header">
      <div id="now-playing">
        <div id="np-year" ref={yearRef}>{year}</div>
        <div id="np-info" ref={infoRef}>
          <div id="np-title">{title}</div>
          <div id="np-artist">{artist}</div>
        </div>
      </div>
      <div id="streak" className={showStreak ? 'show' : ''}>
        <div id="streak-num">{streak}</div>
        <div id="streak-label">연속 1위</div>
      </div>
      <div id="rank-headers">
        {[1, 2, 3, 4, 5].map(r => (
          <div key={r} className="rank-hdr" data-rank={r}>{r}위</div>
        ))}
      </div>
    </div>
  );
}
