export default function Controls({ isPlaying, isMuted, onTogglePlay, onToggleMute, sliderElRef }) {
  return (
    <div id="controls">
      <button id="play-pause-btn" onClick={onTogglePlay} title="재생/정지">
        {isPlaying ? '⏸' : '▶'}
      </button>
      <div id="slider-wrap">
        <div id="year-slider" ref={sliderElRef} />
      </div>
      <button
        id="mute-btn"
        onClick={onToggleMute}
        title="음소거"
        className={isMuted ? 'muted' : ''}
      >
        {isMuted ? '🔇' : '🔊'}
      </button>
    </div>
  );
}
