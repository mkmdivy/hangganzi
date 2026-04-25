export default function Chart({ svgRef, facesRef, chartWrapRef }) {
  return (
    <div id="chart-wrap" ref={chartWrapRef}>
      <div id="year-bg" />
      <svg id="lines-svg" ref={svgRef} />
      <div id="faces" ref={facesRef} />
      <div id="current-line" />
    </div>
  );
}
