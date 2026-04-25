import { useEffect, useRef } from 'react';

export default function Header({ year, title, artist, genre, streak, showStreak, isPlaying }) {
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
      <div id="header-top">
        <div className={`eq-bars${isPlaying ? '' : ' paused'}`}>
          <span className="eq-bar" />
          <span className="eq-bar" />
          <span className="eq-bar" />
          <span className="eq-bar" />
        </div>

        <div id="np-year" ref={yearRef}>{year}</div>

        <div id="np-info" ref={infoRef}>
          <div id="np-title">{title}</div>
          <div id="np-artist">{artist}</div>
        </div>

        {genre && <span id="genre-badge">{genre}</span>}

        <div id="streak" className={showStreak ? 'show' : ''}>
          <span id="streak-icon">🔥</span>
          <div id="streak-num">{streak}</div>
          <div id="streak-label">연속<br />1위</div>
        </div>
      </div>

      <div id="header-bottom">
        {[1, 2, 3].map(r => (
          <div key={r} className="rank-hdr">{r}위</div>
        ))}
      </div>
    </div>
  );
}
