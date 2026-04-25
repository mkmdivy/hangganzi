import { useRef, useState, useEffect } from 'react';
import * as d3 from 'd3';
import noUiSlider from 'nouislider';
import {
  songs, RANK_COLORS, GENRE_BG,
  RANKS, LANE_PROPS, WINDOW, START_YEAR, END_YEAR, YEAR_SPEED,
} from './data/songs.js';
import Splash    from './components/Splash.jsx';
import Header    from './components/Header.jsx';
import Chart     from './components/Chart.jsx';
import Controls  from './components/Controls.jsx';

export default function App() {
  const svgRef       = useRef(null);
  const facesRef     = useRef(null);
  const chartWrapRef = useRef(null);
  const sliderElRef  = useRef(null);
  const engine       = useRef({ togglePlay:()=>{}, toggleMute:()=>{}, goToYear:()=>{}, launchApp:()=>{} });

  const [splashHiding, setSplashHiding] = useState(false);
  const [splashGone,   setSplashGone]   = useState(false);
  const [appVisible,   setAppVisible]   = useState(false);
  const [isPlaying,    setIsPlaying]    = useState(false);
  const [isMuted,      setIsMuted]      = useState(false);
  const [header, setHeader] = useState({
    year: START_YEAR, title: '난 알아요', artist: '서태지와 아이들',
    genre: '댄스', streak: 0, showStreak: false,
  });

  useEffect(() => {
    const s = {
      yrF: START_YEAR, yrI: START_YEAR,
      playing: false, muted: false,
      rafId: null, lastTs: null,
      lastSongKey: null,
      streakCount: 0, streakArtist: '',
      dragging: false, slider: null,
      cardEls: new Map(),
      ytPlayer: null, ytReady: false,
    };

    // ── Layout helpers ────────────────────────────────
    function chartDims() {
      const w = chartWrapRef.current;
      return w ? { W: w.clientWidth, H: w.clientHeight } : { W: 900, H: 600 };
    }

    // Rank 1 owns the left 45%, rank 2 the next 32%, rank 3 the last 23%
    function laneX(rank) {
      const { W } = chartDims();
      let left = 0;
      for (let i = 0; i < rank - 1; i++) left += LANE_PROPS[i];
      return (left + LANE_PROPS[rank - 1] / 2) * W;
    }

    function yearY(year) {
      const { H } = chartDims();
      return (s.yrF - year + 0.5) * (H / WINDOW);
    }

    function cardSize(rank) {
      const { W, H } = chartDims();
      const lw = LANE_PROPS[rank - 1] * W;
      const rh = H / WINDOW;
      if (rank === 1) {
        const CW = Math.min(lw - 36, 300);
        const CH = Math.min(Math.round(CW * 0.62), Math.round(rh * 1.05));
        return { CW, CH, rh };
      }
      const CW = Math.min(lw - (rank === 2 ? 28 : 22), rank === 2 ? 210 : 170);
      const CH = Math.round(CW * 0.72);
      return { CW, CH, rh };
    }

    // Rank 1 fully opaque at current year; ranks 2–3 slightly dimmer
    function cardOpacity(song) {
      const ageFade  = Math.max(0.10, 1 - (s.yrF - song.y) * (0.72 / WINDOW));
      const rankMult = song.r === 1 ? 1.0 : song.r === 2 ? 0.80 : 0.62;
      return ageFade * rankMult;
    }

    // ── D3 glow filter ────────────────────────────────
    const svg = d3.select(svgRef.current);
    const defs   = svg.append('defs');
    const filter = defs.append('filter').attr('id', 'glow-filter')
      .attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%');
    filter.append('feGaussianBlur').attr('stdDeviation', '6').attr('result', 'blur');
    const merge = filter.append('feMerge');
    merge.append('feMergeNode').attr('in', 'blur');
    merge.append('feMergeNode').attr('in', 'SourceGraphic');

    // ── Lines ─────────────────────────────────────────
    function buildSegments() {
      const winStart = s.yrI - WINDOW + 1;
      const visible  = songs.filter(song => song.y >= winStart && song.y <= s.yrI);
      const byArtist = d3.group(visible, d => d.a);
      const segs = [];
      byArtist.forEach((pts, artist) => {
        pts = pts.slice().sort((a, b) => a.y - b.y);
        let seg = [pts[0]];
        for (let i = 1; i < pts.length; i++) {
          if (pts[i].y - pts[i - 1].y <= 1) { seg.push(pts[i]); }
          else { if (seg.length >= 2) segs.push({ artist, pts: seg }); seg = [pts[i]]; }
        }
        if (seg.length >= 2) segs.push({ artist, pts: seg });
      });
      return segs;
    }

    function rebuildLines() {
      const segs = buildSegments();
      const r1   = segs.filter(seg => seg.pts.some(p => p.r === 1));
      const rest = segs.filter(seg => !seg.pts.some(p => p.r === 1));
      const key  = d => d.artist + ':' + d.pts[0].y;

      svg.selectAll('.a-path').data(rest, key).join('path')
        .attr('class', 'a-path').attr('fill', 'none')
        .attr('stroke', d => RANK_COLORS[d.pts[0].r - 1] || '#555')
        .attr('stroke-width', 1.5).attr('stroke-linecap', 'round').attr('stroke-opacity', .22);

      svg.selectAll('.glow-path').data(r1, key).join('path')
        .attr('class', 'glow-path').attr('fill', 'none')
        .attr('stroke', '#ff6b9d').attr('stroke-width', 22).attr('stroke-linecap', 'round')
        .attr('filter', 'url(#glow-filter)').attr('stroke-opacity', .18);

      svg.selectAll('.rank1-path').data(r1, key).join('path')
        .attr('class', 'rank1-path').attr('fill', 'none')
        .attr('stroke', '#ff6b9d').attr('stroke-width', 3).attr('stroke-linecap', 'round')
        .attr('stroke-opacity', .85);
    }

    function updateLines() {
      const { W, H } = chartDims();
      svg.attr('viewBox', `0 0 ${W} ${H}`);
      const lineGen = d3.line()
        .x(d => laneX(d.r)).y(d => yearY(d.y))
        .curve(d3.curveCatmullRom.alpha(0.5));
      svg.selectAll('.a-path, .glow-path, .rank1-path').attr('d', d => lineGen(d.pts));
      const rh = H / WINDOW;
      const cl = document.getElementById('current-line');
      if (cl) cl.style.top = (rh * 0.5 - 1) + 'px';
      const yb = document.getElementById('year-bg');
      if (yb) yb.textContent = s.yrI;
    }

    // ── Cards ─────────────────────────────────────────
    function rebuildCards() {
      const winStart = s.yrI - WINDOW + 1;
      const visible  = songs.filter(song => song.y >= winStart && song.y <= s.yrI);
      const visKeys  = new Set(visible.map(song => song.t + '|' + song.y));
      const facesEl  = facesRef.current;
      if (!facesEl) return;

      for (const [key, info] of s.cardEls) {
        if (!visKeys.has(key) && !info.dying) {
          info.dying = true;
          clearTimeout(info.slideTimer);
          info.el.style.transition = 'opacity 0.45s ease';
          info.el.style.opacity    = '0';
          setTimeout(() => { try { info.el.remove(); } catch (e) {} s.cardEls.delete(key); }, 480);
        }
      }

      for (const song of visible) {
        const key = song.t + '|' + song.y;
        if (s.cardEls.has(key)) continue;
        const { CW, CH, rh } = cardSize(song.r);
        const el = document.createElement('div');
        el.className = `face-card rank${song.r}`;
        el.style.width  = CW + 'px';
        el.style.height = CH + 'px';
        el.style.borderColor = RANK_COLORS[song.r - 1];
        if (song.id) el.style.backgroundImage = `url(https://img.youtube.com/vi/${song.id}/hqdefault.jpg)`;
        else         el.style.backgroundColor = GENRE_BG[song.g] || '#1a1a2e';
        el.style.left      = (laneX(song.r) - CW / 2) + 'px';
        el.style.top       = (yearY(song.y) - CH / 2) + 'px';
        el.style.transform = `translateY(-${rh * 0.7}px)`;
        el.style.opacity   = '0';

        if (song.r === 1) {
          el.innerHTML = `
            <div class="card-overlay r1-overlay">
              <span class="card-genre">${song.g}</span>
              <span class="card-title r1-title">${song.t}</span>
              <span class="card-artist">${song.a}</span>
            </div>`;
        } else {
          el.innerHTML = `
            <div class="card-overlay">
              <span class="card-title">${song.t}</span>
              <span class="card-artist">${song.a}</span>
            </div>
            <div class="card-rank-badge">${song.r}위</div>`;
        }

        el.addEventListener('click', () => { if (song.id) loadSong(song); });
        facesEl.appendChild(el);
        const info = { el, dying: false, slideTimer: null, rank: song.r };
        s.cardEls.set(key, info);
        requestAnimationFrame(() => {
          el.style.transition = 'opacity 0.7s ease, transform 0.9s cubic-bezier(0.22,1,0.36,1)';
          el.style.opacity    = String(cardOpacity(song));
          el.style.transform  = 'translateY(0)';
          info.slideTimer = setTimeout(() => {
            if (!info.dying) { el.style.transition = ''; el.style.transform = ''; }
          }, 950);
        });
      }
    }

    function updatePositions() {
      const winStart = s.yrI - WINDOW + 1;
      const visible  = songs.filter(song => song.y >= winStart && song.y <= s.yrI);
      for (const song of visible) {
        const info = s.cardEls.get(song.t + '|' + song.y);
        if (!info || info.dying || info.el.style.transition !== '') continue;
        const { CW, CH } = cardSize(song.r);
        info.el.style.left    = (laneX(song.r) - CW / 2) + 'px';
        info.el.style.top     = (yearY(song.y) - CH / 2) + 'px';
        info.el.style.opacity = String(cardOpacity(song));
      }
    }

    // ── Header ────────────────────────────────────────
    function updateHeader() {
      const top1 = songs.find(song => song.y === s.yrI && song.r === 1);
      if (!top1) { setHeader(h => ({ ...h, year: s.yrI })); return; }
      const prev = songs.find(song => song.y === s.yrI - 1 && song.r === 1);
      let showStreak = false;
      if (prev && prev.a === top1.a) {
        if (s.streakArtist !== top1.a) { s.streakCount = 2; s.streakArtist = top1.a; }
        else s.streakCount++;
        showStreak = true;
      } else {
        s.streakCount = 1; s.streakArtist = top1.a;
      }
      setHeader({ year: s.yrI, title: top1.t, artist: top1.a, genre: top1.g, streak: s.streakCount, showStreak });
    }

    // ── Music fade ────────────────────────────────────
    let fadeTimerId = null;

    function cancelFade() {
      clearTimeout(fadeTimerId);
      fadeTimerId = null;
    }

    function rampVolume(from, to, durationMs, onDone) {
      cancelFade();
      const STEPS = 20;
      const dt    = durationMs / STEPS;
      let step    = 0;
      const tick = () => {
        step++;
        const vol = Math.round(from + (to - from) * (step / STEPS));
        try { s.ytPlayer.setVolume(Math.max(0, Math.min(100, vol))); } catch (e) {}
        if (step < STEPS) {
          fadeTimerId = setTimeout(tick, dt);
        } else {
          fadeTimerId = null;
          if (onDone) onDone();
        }
      };
      tick();
    }

    // ── YouTube ───────────────────────────────────────
    function loadSong(song) {
      if (!s.ytReady || !song.id || s.muted) return;
      const key = song.y + ':' + song.id;
      if (key === s.lastSongKey) return;
      s.lastSongKey = key;
      const startSec = song.s ?? 45;

      rampVolume(100, 0, 420, () => {
        try {
          s.ytPlayer.loadVideoById({ videoId: song.id, startSeconds: startSec });
          setTimeout(() => rampVolume(0, 100, 550), 220);
        } catch (e) {}
      });
    }

    function playCurrent() {
      const top1 = songs.find(song => song.y === s.yrI && song.r === 1);
      if (top1 && top1.id && !s.muted && s.ytReady) loadSong(top1);
    }

    function stopAudio() {
      cancelFade();
      if (s.ytReady) try { s.ytPlayer.stopVideo(); } catch (e) {}
      s.lastSongKey = null;
    }

    // ── RAF loop ──────────────────────────────────────
    function stopPlay() {
      s.playing = false;
      cancelAnimationFrame(s.rafId);
      setIsPlaying(false);
    }

    function frame(ts) {
      if (!s.playing) { s.lastTs = null; return; }
      if (s.lastTs !== null) {
        const dt = Math.min(ts - s.lastTs, 80);
        s.yrF += YEAR_SPEED * dt;
        if (s.yrF >= END_YEAR + 0.08) {
          s.yrF = END_YEAR;
          updatePositions(); updateLines(); stopPlay();
          return;
        }
        const newI = Math.min(END_YEAR, Math.round(s.yrF));
        if (newI !== s.yrI) {
          s.yrI = newI;
          rebuildCards(); rebuildLines(); updateHeader(); playCurrent();
        }
        updatePositions(); updateLines();
        if (!s.dragging && s.slider) s.slider.set(s.yrF, false);
      }
      s.lastTs = ts;
      s.rafId  = requestAnimationFrame(frame);
    }

    function startPlay() {
      if (s.yrF >= END_YEAR) s.yrF = START_YEAR;
      s.playing = true;
      s.lastTs  = null;
      setIsPlaying(true);
      s.rafId = requestAnimationFrame(frame);
    }

    function togglePlay() { if (s.playing) stopPlay(); else startPlay(); }

    function toggleMute() {
      s.muted = !s.muted;
      setIsMuted(s.muted);
      if (s.muted) stopAudio(); else playCurrent();
    }

    // ── Navigation ────────────────────────────────────
    function goToYear(y) {
      s.yrF = Math.max(START_YEAR, Math.min(END_YEAR, y));
      s.yrI = Math.round(s.yrF);
      rebuildCards(); rebuildLines(); updatePositions(); updateLines(); updateHeader();
      if (!s.dragging && s.slider) s.slider.set(s.yrF, false);
      playCurrent();
    }

    // ── Slider ────────────────────────────────────────
    function initSlider() {
      const el = sliderElRef.current;
      if (!el) return;
      s.slider = noUiSlider.create(el, {
        start: [START_YEAR], step: 0.02,
        range: { min: START_YEAR, max: END_YEAR },
        tooltips: [{ to: v => Math.round(v) + '년', from: v => +v.replace('년', '') }],
        pips: {
          mode: 'values', values: [1995, 2000, 2005, 2010, 2015, 2020],
          density: 4, format: { to: v => v + '', from: v => +v },
        },
      });
      s.slider.on('start', () => { s.dragging = true; stopPlay(); });
      s.slider.on('slide', vals => {
        s.yrF = +vals[0]; s.yrI = Math.round(s.yrF);
        rebuildCards(); rebuildLines(); updatePositions(); updateLines(); updateHeader();
      });
      s.slider.on('end', () => { s.dragging = false; playCurrent(); });
    }

    // ── Lane dividers ─────────────────────────────────
    function initLanes() {
      const { W } = chartDims();
      const wrap  = chartWrapRef.current;
      if (!wrap) return;
      let acc = 0;
      for (let i = 0; i < RANKS - 1; i++) {
        acc += LANE_PROPS[i];
        const d = document.createElement('div');
        d.className  = 'lane-div';
        d.style.left = (acc * W) + 'px';
        wrap.appendChild(d);
      }
    }

    // ── Launch ────────────────────────────────────────
    function launchApp(startMuted) {
      s.muted = startMuted;
      setIsMuted(startMuted);
      setSplashHiding(true);
      setTimeout(() => setSplashGone(true), 650);
      setAppVisible(true);
      setTimeout(() => {
        initLanes(); initSlider();
        rebuildCards(); rebuildLines();
        updatePositions(); updateLines(); updateHeader();
        startPlay();
      }, 120);
    }

    // ── YouTube init ──────────────────────────────────
    window.onYouTubeIframeAPIReady = () => {
      s.ytPlayer = new window.YT.Player('yt-holder', {
        width: 1, height: 1,
        playerVars: { autoplay: 0, controls: 0, disablekb: 1, playsinline: 1, rel: 0 },
        events: { onReady: () => { s.ytReady = true; } },
      });
    };
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.body.appendChild(tag);
    }

    // ── Keyboard ──────────────────────────────────────
    function onKey(e) {
      if (e.code === 'Space')      { e.preventDefault(); togglePlay(); }
      if (e.code === 'ArrowRight') { stopPlay(); goToYear(s.yrF + 1); }
      if (e.code === 'ArrowLeft')  { stopPlay(); goToYear(s.yrF - 1); }
      if (e.code === 'KeyM')       { toggleMute(); }
    }
    document.addEventListener('keydown', onKey);

    // ── Resize ────────────────────────────────────────
    let rT;
    function onResize() {
      clearTimeout(rT);
      rT = setTimeout(() => {
        document.querySelectorAll('.lane-div').forEach(e => e.remove());
        initLanes();
        for (const [, info] of s.cardEls) {
          if (!info.dying) {
            const { CW, CH } = cardSize(info.rank);
            info.el.style.width = CW + 'px'; info.el.style.height = CH + 'px';
          }
        }
        rebuildLines(); updatePositions(); updateLines();
      }, 200);
    }
    window.addEventListener('resize', onResize);

    engine.current = { togglePlay, toggleMute, goToYear, launchApp };

    return () => {
      cancelAnimationFrame(s.rafId);
      cancelFade();
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      window.onYouTubeIframeAPIReady = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {!splashGone && (
        <Splash
          hiding={splashHiding}
          onStart={() => engine.current.launchApp(false)}
          onStartMuted={() => engine.current.launchApp(true)}
        />
      )}
      <div id="app" className={appVisible ? 'visible' : ''}>
        <Header {...header} isPlaying={isPlaying} />
        <Chart svgRef={svgRef} facesRef={facesRef} chartWrapRef={chartWrapRef} />
        <Controls
          isPlaying={isPlaying}
          isMuted={isMuted}
          onTogglePlay={() => engine.current.togglePlay()}
          onToggleMute={() => engine.current.toggleMute()}
          sliderElRef={sliderElRef}
        />
      </div>
    </>
  );
}
