<script>
  import { ptPerMm as K, snapAxis, snapTargets, sampleValues, fillText, bounds, formatDate, twoDimensional } from '../lib/model.js';
  import { sketchLinear, sketchMatrix } from '../lib/sketch.js';

  const rectPath = rects => rects.map(r => `M${r.x * K} ${r.y * K}h${r.w * K}v${r.h * K}h${-r.w * K}z`).join('');
  const shownText = item => item.type === 'stack' ? fillText(item.items, values)
    : item.type === 'date' ? `${item.prefix || ''}${formatDate(new Date(), item.format)}${item.suffix || ''}`
    : editor.showFieldNames ? item.text : fillText(item.text, values);

  let { editor, warnings = [], ontextedit } = $props();
  const M = 6; // margin in mm around the label, so handles at the edge stay reachable
  let svgEl = $state();
  let guides = $state([]);
  let drag = null;

  const canvas = $derived(editor.canvas);
  const z = $derived(editor.zoom);
  const values = $derived(sampleValues(editor.definition?.fields || {}));
  const warned = $derived(new Set(warnings.map(w => w.object)));
  const stageW = $derived((canvas.w + 2 * M) * z), stageH = $derived((canvas.h + 2 * M) * z);
  const fontPt = size => typeof size === 'string' ? editor.style?.[size.slice(1)] ?? 10 : size ?? 10;
  const objectName = (item, index) => item.id || `${item.type}${index + 1}`;

  function point(event) {
    const rect = svgEl.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / z - M, y: (event.clientY - rect.top) / z - M };
  }
  const options = event => ({ grid: editor.snap && !event.altKey ? editor.grid : 0, threshold: editor.snap && !event.altKey ? 6 / z : 0 });
  const others = () => editor.doc.objects.filter(o => !editor.selected.includes(o.uid));

  function backgroundDown(event) {
    if (event.button !== 0) return;
    if (editor.tool !== 'select') {
      const p = point(event), opts = options(event);
      const snap = v => opts.grid ? Math.round(v / opts.grid) * opts.grid : v;
      editor.add(editor.tool, { x: Math.max(0, Math.min(canvas.w - 1, snap(p.x))), y: Math.max(0, Math.min(canvas.h - 1, snap(p.y))) });
      return;
    }
    editor.selected = [];
  }

  function objectDown(event, item) {
    if (event.button !== 0 || editor.tool !== 'select') return;
    event.stopPropagation();
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      editor.selected = editor.selected.includes(item.uid) ? editor.selected.filter(u => u !== item.uid) : [...editor.selected, item.uid];
      return;
    }
    if (!editor.selected.includes(item.uid)) editor.selected = [item.uid];
    drag = { kind: 'move', start: point(event), orig: editor.selection.map(o => ({ uid: o.uid, x: o.x, y: o.y })), box: bounds(editor.selection), moved: false };
    svgEl.setPointerCapture(event.pointerId);
  }

  function handleDown(event, item, handle) {
    if (event.button !== 0) return;
    event.stopPropagation();
    drag = { kind: 'resize', uid: item.uid, handle, start: point(event), orig: { x: item.x, y: item.y, w: item.w, h: item.h }, moved: false };
    svgEl.setPointerCapture(event.pointerId);
  }

  function move(event) {
    if (!drag) return;
    const p = point(event), dx = p.x - drag.start.x, dy = p.y - drag.start.y, opts = options(event);
    if (!drag.moved && Math.hypot(dx, dy) * z < 2) return;
    drag.moved = true;
    const tx = snapTargets(others(), canvas, 'x'), ty = snapTargets(others(), canvas, 'y');
    if (drag.kind === 'move') {
      const sx = snapAxis(drag.box.x + dx, drag.box.w, tx, opts), sy = snapAxis(drag.box.y + dy, drag.box.h, ty, opts);
      const mx = sx.value - drag.box.x, my = sy.value - drag.box.y;
      for (const o of drag.orig) editor.update(o.uid, { x: +(o.x + mx).toFixed(2), y: +(o.y + my).toFixed(2) });
      guides = [...(sx.guide !== null ? [{ axis: 'x', at: sx.guide }] : []), ...(sy.guide !== null ? [{ axis: 'y', at: sy.guide }] : [])];
      return;
    }
    const o = drag.orig, item = editor.doc.objects.find(i => i.uid === drag.uid);
    const edge = (value, targets, axis) => {
      const s = snapAxis(value, 0, targets, opts);
      if (s.guide !== null) guides = [...guides.filter(g => g.axis !== axis), { axis, at: s.guide }];
      return s.value;
    };
    guides = [];
    if (item.type === 'line') {
      let x1 = o.x, y1 = o.y, x2 = o.x + o.w, y2 = o.y + o.h;
      let nx = edge((drag.handle === 'p1' ? x1 : x2) + dx, tx, 'x'), ny = edge((drag.handle === 'p1' ? y1 : y2) + dy, ty, 'y');
      const [ax, ay] = drag.handle === 'p1' ? [x2, y2] : [x1, y1];
      if (event.shiftKey) {
        // Keep the line horizontal, vertical or at 45 degrees.
        const ddx = nx - ax, ddy = ny - ay, angle = Math.round(Math.atan2(ddy, ddx) / (Math.PI / 4)) * (Math.PI / 4), len = Math.hypot(ddx, ddy);
        nx = +(ax + Math.cos(angle) * len).toFixed(2); ny = +(ay + Math.sin(angle) * len).toFixed(2);
      }
      if (drag.handle === 'p1') editor.update(item.uid, { x: nx, y: ny, w: +(x2 - nx).toFixed(2), h: +(y2 - ny).toFixed(2) });
      else editor.update(item.uid, { w: +(nx - x1).toFixed(2), h: +(ny - y1).toFixed(2) });
      return;
    }
    let l = o.x, r = o.x + o.w, t = o.y, b = o.y + o.h;
    const h = drag.handle;
    if (h.includes('w')) l = Math.min(edge(l + dx, tx, 'x'), r - 0.5);
    if (h.includes('e')) r = Math.max(edge(r + dx, tx, 'x'), l + 0.5);
    if (h.includes('n')) t = Math.min(edge(t + dy, ty, 'y'), b - 0.5);
    if (h.includes('s')) b = Math.max(edge(b + dy, ty, 'y'), t + 0.5);
    if (event.shiftKey && h.length === 2 && o.h > 0) {
      // Corner handles keep the proportions with Shift.
      const ratio = o.w / o.h, w = r - l, hgt = w / ratio;
      if (h.includes('n')) t = b - hgt; else b = t + hgt;
      guides = [];
    }
    editor.update(item.uid, { x: +l.toFixed(2), y: +t.toFixed(2), w: +(r - l).toFixed(2), h: +(b - t).toFixed(2) });
  }

  function up() {
    if (drag?.moved) editor.commit();
    drag = null; guides = [];
  }

  function wheel(event) {
    if (!event.ctrlKey) return;
    event.preventDefault();
    editor.zoom = Math.min(40, Math.max(1, +(editor.zoom * (event.deltaY < 0 ? 1.15 : 1 / 1.15)).toFixed(2)));
  }

  const handles = item => item.type === 'line'
    ? [['p1', item.x, item.y], ['p2', item.x + item.w, item.y + item.h]]
    : [['nw', 0, 0], ['n', 0.5, 0], ['ne', 1, 0], ['e', 1, 0.5], ['se', 1, 1], ['s', 0.5, 1], ['sw', 0, 1], ['w', 0, 0.5]]
      .map(([name, fx, fy]) => [name, item.x + item.w * fx, item.y + item.h * fy]);
  const cursors = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', p1: 'move', p2: 'move' };

  // Ruler ticks: every millimetre when there is room, longer every 5 and numbered every 10.
  const ticks = side => {
    const step = z >= 3 ? 1 : z >= 1.2 ? 5 : 10, list = [];
    for (let mm = 0; mm <= side + 0.001; mm += step) list.push({ mm, kind: mm % 10 === 0 ? 'major' : mm % 5 === 0 ? 'mid' : 'minor' });
    return list;
  };
  const gridLines = $derived(editor.showGrid && editor.grid * z >= 5 ? {
    x: Array.from({ length: Math.floor(canvas.w / editor.grid) }, (_, i) => (i + 1) * editor.grid),
    y: Array.from({ length: Math.floor(canvas.h / editor.grid) }, (_, i) => (i + 1) * editor.grid)
  } : null);
</script>

<div class="scroller" onwheel={wheel}>
  <div class="board" style:grid-template-columns="20px {stageW}px" style:grid-template-rows="20px {stageH}px">
    <div class="corner">mm</div>
    <svg class="ruler top" width={stageW} height="20" aria-hidden="true">
      {#each ticks(canvas.w) as t (t.mm)}
        <line x1={(t.mm + M) * z} x2={(t.mm + M) * z} y1={t.kind === 'major' ? 6 : t.kind === 'mid' ? 11 : 15} y2="20" />
        {#if t.kind === 'major'}<text x={(t.mm + M) * z + 2} y="10">{t.mm}</text>{/if}
      {/each}
    </svg>
    <svg class="ruler left" width="20" height={stageH} aria-hidden="true">
      {#each ticks(canvas.h) as t (t.mm)}
        <line y1={(t.mm + M) * z} y2={(t.mm + M) * z} x1={t.kind === 'major' ? 6 : t.kind === 'mid' ? 11 : 15} x2="20" />
        {#if t.kind === 'major'}<text x="2" y={(t.mm + M) * z - 2} transform="rotate(-90 2 {(t.mm + M) * z - 2})">{t.mm}</text>{/if}
      {/each}
    </svg>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <svg bind:this={svgEl} class="stage" class:creating={editor.tool !== 'select'} width={stageW} height={stageH}
      viewBox="{-M * K} {-M * K} {(canvas.w + 2 * M) * K} {(canvas.h + 2 * M) * K}"
      onpointerdown={backgroundDown} onpointermove={move} onpointerup={up} onpointercancel={up}
      ondblclick={() => { if (editor.selection.length === 1 && editor.selection[0].type === 'text') ontextedit?.(); }}>
      <rect class="label" x="0" y="0" width={canvas.w * K} height={canvas.h * K} rx="2" />
      {#if gridLines}
        <g class="grid">
          {#each gridLines.x as x (x)}<line x1={x * K} x2={x * K} y1="0" y2={canvas.h * K} />{/each}
          {#each gridLines.y as y (y)}<line y1={y * K} y2={y * K} x1="0" x2={canvas.w * K} />{/each}
        </g>
      {/if}

      {#each editor.doc.objects as item, index (item.uid)}
        {@const ink = item.color === 'white' || item.fill === 'white' ? 'white' : 'black'}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <g class="object" class:warned={warned.has(objectName(item, index))} onpointerdown={e => objectDown(e, item)}>
          {#if item.type === 'text' || item.type === 'stack' || item.type === 'date'}
            {@const size = fontPt(item.size)}
            <foreignObject x={item.x * K} y={item.y * K} width={Math.max(item.w, 0.1) * K} height={Math.max(item.h, 0.1) * K}>
              <div class="text" style:font-family="'{item.font || 'Liberation Sans'}'" style:font-size="{size}px"
                style:font-weight={item.bold ? 'bold' : 'normal'} style:font-style={item.italic ? 'italic' : 'normal'}
                style:text-align={item.align || 'center'} style:line-height={item.lineHeight || 1.2}
                style:justify-content={{ top: 'flex-start', middle: 'center', bottom: 'flex-end' }[item.valign || (item.type === 'stack' ? 'middle' : 'top')]}
                style:color={item.color === 'white' ? 'white' : 'black'} style:white-space={item.wrap === false ? 'pre' : 'pre-wrap'}
                style:overflow-wrap={item.breakHyphens ? 'anywhere' : 'normal'}>
                <span>{shownText(item)}</span>
              </div>
            </foreignObject>
            <rect class="hit" x={item.x * K} y={item.y * K} width={item.w * K} height={item.h * K} />
          {:else if item.type === 'barcode'}
            {@const data = editor.showFieldNames ? item.data : fillText(item.data, values)}
            {#if twoDimensional(item.symbology)}
              <path d={rectPath(sketchMatrix(item, data, item.symbology))} fill="black" />
            {:else}
              {@const size = fontPt(item.size ?? 8)}
              {@const textMm = item.humanReadable === 'none' ? 0 : size * 1.2 / K}
              <path d={rectPath(sketchLinear(item, data, Math.max(item.h - textMm, 0.5)))} fill="black" />
              {#if item.humanReadable !== 'none'}
                <text x={(item.x + item.w / 2) * K} y={(item.y + item.h) * K - size * 0.25} font-size={size} text-anchor="middle"
                  font-family="'{item.font || 'Liberation Sans'}'" fill="black">{data}</text>
              {/if}
            {/if}
            <rect class="hit" x={item.x * K} y={item.y * K} width={item.w * K} height={item.h * K} />
          {:else if item.type === 'line'}
            <line x1={item.x * K} y1={item.y * K} x2={(item.x + item.w) * K} y2={(item.y + item.h) * K} stroke="black"
              stroke-width={(item.stroke || 0.3) * K} stroke-dasharray={item.dash?.map(d => d * K).join(' ')} />
            <line class="hit" x1={item.x * K} y1={item.y * K} x2={(item.x + item.w) * K} y2={(item.y + item.h) * K} stroke-width={Math.max(8 / z, 1.5) * K} />
          {:else}
            {@const sw = (item.stroke ?? 0.3) * K}
            {@const fill = item.fill === 'black' ? 'black' : item.fill === 'white' ? 'white' : 'none'}
            {#if item.type === 'ellipse'}
              <ellipse cx={(item.x + item.w / 2) * K} cy={(item.y + item.h / 2) * K} rx={item.w / 2 * K} ry={item.h / 2 * K} {fill}
                stroke={sw > 0 ? 'black' : 'none'} stroke-width={sw} stroke-dasharray={item.dash?.map(d => d * K).join(' ')} />
            {:else}
              <rect x={item.x * K} y={item.y * K} width={item.w * K} height={item.h * K} rx={(item.radius || 0) * K} {fill}
                stroke={sw > 0 ? 'black' : 'none'} stroke-width={sw} stroke-dasharray={item.dash?.map(d => d * K).join(' ')} />
            {/if}
            <rect class="hit" x={item.x * K} y={item.y * K} width={item.w * K} height={item.h * K} />
          {/if}
          {#if ink === 'white'}<title>White ink on black</title>{/if}
        </g>
      {/each}

      {#each guides as g (g.axis + g.at)}
        {#if g.axis === 'x'}<line class="guide" x1={g.at * K} x2={g.at * K} y1={-M * K} y2={(canvas.h + M) * K} />
        {:else}<line class="guide" y1={g.at * K} y2={g.at * K} x1={-M * K} x2={(canvas.w + M) * K} />{/if}
      {/each}

      {#each editor.selection as item (item.uid)}
        {@const b = bounds([item])}
        <rect class="selected" x={b.x * K} y={b.y * K} width={Math.max(b.w, 0.01) * K} height={Math.max(b.h, 0.01) * K} />
        {#if editor.selected.length === 1}
          {#each handles(item) as [name, hx, hy] (name)}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <rect class="handle" style:cursor={cursors[name]} x={hx * K - 4 / z * K} y={hy * K - 4 / z * K} width={8 / z * K} height={8 / z * K}
              onpointerdown={e => handleDown(e, item, name)} />
          {/each}
        {/if}
      {/each}
    </svg>
  </div>
</div>

<style>
  .scroller { overflow: auto; background: var(--stage); height: 100%; }
  .board { display: grid; width: max-content; margin: 0 auto; padding: 0 24px 24px 0; }
  .corner { position: sticky; top: 0; left: 0; z-index: 3; background: var(--panel); font-size: 9px; color: var(--muted); display: grid; place-items: center; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); }
  .ruler { background: var(--panel); position: sticky; z-index: 2; }
  .ruler.top { top: 0; border-bottom: 1px solid var(--line); }
  .ruler.left { left: 0; border-right: 1px solid var(--line); }
  .ruler line { stroke: var(--muted); stroke-width: 1; }
  .ruler text { fill: var(--muted); font-size: 9px; font-family: system-ui, sans-serif; }
  .stage { display: block; touch-action: none; user-select: none; }
  .stage.creating { cursor: crosshair; }
  .label { fill: #fff; filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.45)); }
  .grid line { stroke: var(--grid); stroke-width: 0.25; }
  .text { width: 100%; height: 100%; display: flex; flex-direction: column; overflow: hidden; pointer-events: none; }
  .hit { fill: transparent; stroke: transparent; cursor: move; }
  line.hit { stroke: transparent; }
  .object.warned :global(.hit) { stroke: var(--danger); stroke-width: 1.2; stroke-dasharray: 3 2; }
  .selected { fill: none; stroke: var(--accent); stroke-width: 0.9; stroke-dasharray: 3 2; pointer-events: none; vector-effect: non-scaling-stroke; }
  .handle { fill: #fff; stroke: var(--accent); stroke-width: 1.2; vector-effect: non-scaling-stroke; }
  .guide { stroke: #e040fb; stroke-width: 0.8; vector-effect: non-scaling-stroke; pointer-events: none; }
</style>
