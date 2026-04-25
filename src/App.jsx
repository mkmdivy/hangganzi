import { useRef, useState, useEffect } from 'react';
import * as d3 from 'd3';
import noUiSlider from 'nouislider';
import { songs, RANK_COLORS, GENRE_BG, RANKS, WINDOW, START_YEAR, END_YEAR, YEAR_SPEED } from './data/songs.js';
import Splash from './components/Splash.jsx';
import Header from './components/Header.jsx';
import Chart from './components/Chart.jsx';
import Controls from './components/Controls.jsx';

export default function App() {
  const svgRef       = useRef(null);
  const facesRef     = useRef(null);
  const chartWrapRef = useRef(null);
  const sliderElRef  = useRef(null);
  const engine       = useRef({
    togglePlay:     () => {},
    toggleMute:     () => {},
    goToYear:       () => {},
    launchApp:      () => {},
  });

  const [splashHiding, setSplashHiding] = useState(false);
  const [splashGone,   setSplashGone]   = useState(false);
  const [appVisible,   setAppVisible]   = useState(false);
  const [isPlaying,    setIsPlaying]    = useState(false);
  const [isMuted,      setIsMuted]      = useState(false);
  const [header, setHeader] = useState({
    year: START_YEAR, title: '난 알아요', artist: '서태지와 아이들',
    streak: 0, showStreak: false,
  });

  useEffect(() => {
    // All mutable animation state in a plain object — no re-renders
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
      return w ? { W: w.clientWidth, H: w.clientHeight } : { W: 800, H: 600 };
    }
    function laneX(rank) {
      const { W } = chartDims();
      const lw = W / RANKS;
      return (rank - 1) * lw + lw / 2;
    }
    function yearY(year) {
      const { H } = chartDims();
      return (s.yrF - year + 0.5) * (H / WINDOW);
    }
    function cardSize() {
      const { W, H } = chartDims();
      const lw = W / RANKS;
      const rh = H / WINDOW;
      const CW = Math.min(lw - 24, 200);
      const CH = Math.round(CW * 0.72);
      return { CW, CH, rh, lw };
    }
    function cardOpacity(song) {
      return Math.max(0.10, 1 - (s.yrF - song.y) * (0.72 / WINDOW));
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
        .attr('stroke-width', 1.5).attr('stroke-linecap', 'round').attr('stroke-opacity', .28);

      svg.selectAll('.glow-path').data(r1, key).join('path')
        .attr('class', 'glow-path').attr('fill', 'none')
        .attr('stroke', '#ff6b9d').attr('stroke-width', 18).attr('stroke-linecap', 'round')
        .attr('filter', 'url(#glow-filter)').attr('stroke-opacity', .22);

      svg.selectAll('.rank1-path').data(r1, key).join('path')
        .attr('class', 'rank1-path').attr('fill', 'none')
        .attr('stroke', '#ff6b9d').attr('stroke-width', 3.5).attr('stroke-linecap', 'round')
        .attr('stroke-opacity', .9);
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
      const { CW, CH, rh } = cardSize();

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
        const el = document.createElement('div');
        el.className = `face-card rank${song.r}`;
        el.style.width  = CW + 'px';
        el.style.height = CH + 'px';
        el.style.borderColor = RANK_COLORS[song.r - 1];
        if (song.id) el.style.backgroundImage = `url(https://img.youtube.com/vi/${song.id}/hqdefault.jpg)`;
        else         el.style.backgroundColor = GENRE_BG[song.g] || '#1a1a2e';
        el.style.left      = (laneX(song.r) - CW / 2) + 'px';
        el.style.top       = (yearY(song.y) - CH / 2) + 'px';
        el.style.transform = `translateY(-${rh * 0.75}px)`;
        el.style.opacity   = '0';
        el.innerHTML = `
          <div class="card-overlay">
            <span class="card-title">${song.t}</span>
            <span class="card-artist">${song.a}</span>
          </div>
          <div class="card-rank-badge">${song.r}위</div>`;
        el.addEventListener('click', () => { if (song.id) loadSong(song.id, song.t, song.a, song.y); });
        facesEl.appendChild(el);
        const info = { el, dying: false, slideTimer: null };
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
      const { CW, CH } = cardSize();
      const winStart = s.yrI - WINDOW + 1;
      const visible  = songs.filter(song => song.y >= winStart && song.y <= s.yrI);
      for (const song of visible) {
        const info = s.cardEls.get(song.t + '|' + song.y);
        if (!info || info.dying || info.el.style.transition !== '') continue;
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
        s.streakCount = 1;
        s.streakArtist = top1.a;
      }
      setHeader({ year: s.yrI, title: top1.t, artist: top1.a, streak: s.streakCount, showStreak });
    }

    // ── DJ scratch synthesizer ────────────────────────
    let audioCtx = null;

    function ensureCtx() {
      if (!audioCtx || audioCtx.state === 'closed') audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      return audioCtx;
    }

    function playScratch() {
      try {
        const ctx = ensureCtx();
        const now = ctx.currentTime;

        // Two scratch strokes: forward then backward, like a real DJ cue
        [-1, 1].forEach((dir, i) => {
          const onset = now + i * 0.13;
          const dur   = 0.14;
          const len   = Math.ceil(ctx.sampleRate * dur);
          const buf   = ctx.createBuffer(1, len, ctx.sampleRate);
          const data  = buf.getChannelData(0);

          for (let n = 0; n < len; n++) {
            const t     = n / len;
            const env   = Math.sin(t * Math.PI);             // bell shape
            const noise = Math.random() * 2 - 1;
            // Amplitude modulation mimics the "wicky" vinyl texture
            const mod   = 0.6 + 0.4 * Math.sin(t * 38 * dir);
            data[n]     = noise * env * mod;
          }

          const src = ctx.createBufferSource();
          src.buffer = buf;

          // Sweep bandpass: low→high on forward stroke, high→low on backward
          const bpf = ctx.createBiquadFilter();
          bpf.type = 'bandpass';
          bpf.Q.value = 2.8;
          const fStart = dir > 0 ? 600  : 3200;
          const fEnd   = dir > 0 ? 3200 : 600;
          bpf.frequency.setValueAtTime(fStart, onset);
          bpf.frequency.exponentialRampToValueAtTime(fEnd, onset + dur);

          const gain = ctx.createGain();
          gain.gain.setValueAtTime(0, onset);
          gain.gain.linearRampToValueAtTime(0.55, onset + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.001, onset + dur);

          src.connect(bpf);
          bpf.connect(gain);
          gain.connect(ctx.destination);
          src.start(onset);
          src.stop(onset + dur + 0.02);
        });
      } catch (e) { /* AudioContext blocked (e.g. no user gesture yet) */ }
    }

    // ── YouTube ───────────────────────────────────────
    function loadSong(ytId, title, artist, year) {
      if (!s.ytReady || !ytId || s.muted) return;
      const key = year + ':' + ytId;
      if (key === s.lastSongKey) return;
      s.lastSongKey = key;

      // 1 — scratch sound
      playScratch();

      // 2 — visual flash on the now-playing block
      const npEl = document.getElementById('now-playing');
      if (npEl) {
        npEl.classList.remove('dj-flash');
        void npEl.offsetWidth;
        npEl.classList.add('dj-flash');
      }

      // 3 — spin the current track down, then load the new one
      const yt = s.ytPlayer;
      try { yt.setPlaybackRate(0.5); } catch (e) {}
      setTimeout(() => { try { yt.setPlaybackRate(0.15); } catch (e) {} }, 110);
      setTimeout(() => {
        try {
          yt.setPlaybackRate(1);
          yt.loadVideoById({ videoId: ytId, startSeconds: 30 });
        } catch (e) {}
      }, 340);
    }

    function playCurrent() {
      const top1 = songs.find(song => song.y === s.yrI && song.r === 1);
      if (top1 && top1.id && !s.muted && s.ytReady) loadSong(top1.id, top1.t, top1.a, top1.y);
    }

    function stopAudio() {
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
        start: [START_YEAR],
        step: 0.02,
        range: { min: START_YEAR, max: END_YEAR },
        tooltips: [{ to: v => Math.round(v) + '년', from: v => +v.replace('년', '') }],
        pips: {
          mode: 'values',
          values: [1995, 2000, 2005, 2010, 2015, 2020],
          density: 4,
          format: { to: v => v + '', from: v => +v },
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
      const lw   = W / RANKS;
      const wrap = chartWrapRef.current;
      if (!wrap) return;
      for (let r = 1; r < RANKS; r++) {
        const d = document.createElement('div');
        d.className  = 'lane-div';
        d.style.left = (r * lw) + 'px';
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
        initLanes();
        initSlider();
        rebuildCards();
        rebuildLines();
        updatePositions();
        updateLines();
        updateHeader();
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
        const { CW, CH } = cardSize();
        for (const [, info] of s.cardEls) {
          if (!info.dying) { info.el.style.width = CW + 'px'; info.el.style.height = CH + 'px'; }
        }
        rebuildLines(); updatePositions(); updateLines();
      }, 200);
    }
    window.addEventListener('resize', onResize);

    // ── Expose API to React callbacks ─────────────────
    engine.current = { togglePlay, toggleMute, goToYear, launchApp };

    return () => {
      cancelAnimationFrame(s.rafId);
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
        <Header {...header} />
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
