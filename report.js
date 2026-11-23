/* Route survey report renderer: builds A4 pages from the survey data model.
   Same code is meant to run inside the field app; print / save as PDF from the browser. */
(function () {
  const D = window.SURVEY, P = D.project, R = D.records;
  const A = window.ASSETS || {};
  const root = document.getElementById('report');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = v => (v === '' || v == null) ? '' : String(v).replace('.', ',');
  const km1 = v => v == null ? '' : (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');
  const mapsUrl = r => (r && r.latDec != null) ? `https://www.google.com/maps?q=${r.latDec.toFixed(6)},${r.lonDec.toFixed(6)}` : '#';
  const tr = v => String(v == null ? '' : v).trim();
  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

  // ---------- derived numbers (Brief Information, conclusion) ----------
  const main = R.filter(r => !r.flag);
  const cnt = t => R.filter(r => t.includes(r.obstacle)).length;
  const stats = {
    bridges: cnt(['Bridge']),
    turns: cnt(['Left Turn', 'Right Turn', 'Curve', 'U Turn', 'Roundabout Turn']),
    overhead: cnt(['Overhead Structure']),
    distance: Math.round(Math.max(0, ...main.map(r => r.km || 0))),
    first: R[0], last: main[main.length - 1],
  };
  const grades = R.filter(r => /Inclination|Declination/.test(r.obstacle))
    .map(r => ({ r, v: Math.max(0, ...[...r.remarks.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)].map(m => parseFloat(m[1].replace(',', '.')))) }));
  stats.maxGrade = grades.reduce((a, b) => (b.v > (a ? a.v : -1) ? b : a), null);

  const LOGOS = (A.logos || []).filter(l => l && l.src);
  const byKey = k => (LOGOS.find(l => l.key === k) || {}).src;
  const company = byKey('company') || A.logoCompany;
  const others = ['client1', 'client2', 'owner'].map(byKey).filter(Boolean);
  // cover areas: tl / tr / mid stack up to two logos, row puts up to two side by side
  const CV = A.cover || { tl: [company], tr: others.slice(0, 1), mid: [company], row: others.slice(0, 2) };
  const stack = (list, h1, h2, mw) => list.map(src => `<img src="${src}" class="fit" style="max-height:${list.length > 1 ? h2 : h1}mm;max-width:${mw || 85}%" alt="">`).join('');
  // ---------- page factory ----------
  let pageNo = 0;
  const pages = [];
  function newPage(kind) {
    const pg = el(`<section class="page ${kind || ''}"></section>`);
    const isCover = kind === 'cover';
    if (!isCover && kind !== 'a3' && !/\blp\b/.test(kind || '')) {   // landscape record pages carry their own header and logos
      // two logos: company left, client right. three logos: company left, partner right, client bottom right
      // up to four logos, each in the corner chosen in the app (tl / tr / bl / br); scaled to fit, never past the margins
      for (const pos of ['tl', 'tr', 'bl', 'br']) {
        const ls = LOGOS.filter(l => l.pos === pos); if (!ls.length) continue;
        pg.appendChild(el(`<div class="lg lg-${pos} n${Math.min(ls.length, 3)}">${ls.map(l => `<img src="${l.src}" alt="">`).join('')}</div>`));
      }
    }
    if (!isCover) { pageNo += 1; pg.appendChild(el(`<div class="pno">${pageNo}</div>`)); pg.dataset.no = pageNo; }
    root.appendChild(pg); pages.push(pg);
    return pg;
  }
  // flowing text: append blocks, start a new page when the content area overflows
  let flowArea = null;
  function flowPage() { const pg = newPage('text'); flowArea = el('<div class="content"></div>'); pg.appendChild(flowArea); return flowArea; }
  function flow(node) {
    if (!flowArea) flowPage();
    flowArea.appendChild(node);
    if (flowArea.scrollHeight > flowArea.clientHeight + 1 && flowArea.children.length > 1) {
      flowArea.removeChild(node); flowPage(); flowArea.appendChild(node);
    }
    return node;
  }
  const H1 = (n, t) => `<h1 data-toc="${n}"><span>${n}</span><span>${t}</span></h1>`;
  const H2 = (n, t) => `<h2 data-toc="${n}"><span>${n}</span><span>${t}</span></h2>`;
  const keep = html => flow(el(`<div class="keep">${html}</div>`));

  // ---------- cover ----------
  (function cover() {
    const pg = newPage('cover');
    pg.innerHTML += `
    <div class="box top"><div class="stack">${stack(CV.tl, 16, 10.5)}</div>
      <div class="ttl">Route Survey Report /<br>Güzergah Etüdü Raporu</div>
      <div class="stack">${stack(CV.tr, 20, 12)}</div></div>
    <div class="box main">
      <div class="r logo stack">${stack(CV.mid, 19, 15, 70)}</div>
      <div class="r co">${esc(P.company)}</div>
      <div class="r title">${esc(P.title)}</div>
      ${CV.row.length ? `<div class="r client" style="gap:10mm">${CV.row.map(src => `<img src="${src}" class="fit" style="max-height:20mm;max-width:${CV.row.length > 1 ? 42 : 80}%" alt="">`).join('')}</div>` : ''}
      <div class="r grid g1">
        <div><span class="k">PREPARED BY / HAZIRLAYAN:</span><span class="v">${P.preparedBy.map(esc).join('<br>')}</span></div>
        <div><span class="k">DATE PREPARED / HAZIRLAMA TARİHİ:</span><span class="v">${esc(P.date)}</span></div>
        <div><span class="k">REV. NO AND DATE / REVİZYON NO VE TARİHİ:</span><span class="v">${esc(P.rev)}</span></div>
      </div>
      <div class="r grid g2">
        <div><span class="k">PROJECT REFERENCE / PROJE REFERANSI:</span><span class="v">${esc(P.reference)}</span></div>
        <div><span class="k">CLIENT NAME / MÜŞTERİ UNVANI:</span><span class="v">${esc(P.client)}</span></div>
        <div><span class="k">PREPARED FOR / HAZIRLANDIĞI KURUM:</span><span class="v">${esc(P.preparedFor)}</span></div>
      </div>
      ${A.coverPhoto ? `<div class="r photo"><img src="${A.coverPhoto}" alt=""></div>` : ''}
    </div>
    <div class="code">${esc(P.formCode)}</div>`;
  })();

  // ---------- contents (filled after pagination) ----------
  const TOC = [['1', 'Introduction'], ['1.1', 'Scope'], ['1.2', 'Abbreviations and Symbols'], ['1.3', 'Route'], ['1.4', 'Obstacles on the Route'],
    ['1.5', 'Brief Information'], ['2', 'Transportation Drawing'], ['3', 'Route Survey'], ['4', 'Conclusion'], ['4.1', 'Bridge'],
    ['4.2', 'Overhead Structures'], ['4.3', 'Inclinations and Declinations'], ['4.4', 'Power Lines and Cables'], ['4.5', 'Curves and Turns'],
    ['4.6', 'Road Condition'], ['4.7', 'Climatic Conditions'], ['4.8', 'Permits']];
  (function contents() {
    const pg = newPage('text');
    pg.appendChild(el(`<div class="content toc"><h1>Contents</h1>${TOC.map(([n, t]) =>
      `<div class="row ${n.includes('.') ? 'sub' : ''}"><span class="n">${n}</span><span class="t">${t}</span><span class="dots"></span><span class="pg" data-for="${n}"></span></div>`).join('')}</div>`));
  })();

  // ---------- 1 Introduction ----------
  const S = P.start.name, E = P.end.name, CO = P.companyShort;
  flowPage();
  keep(`${H1('1', 'Introduction')}${H2('1.1', 'Scope')}
    <p>This route survey report presents the technical assessment of the route for the overland transportation of out-of-gauge (OOG) cargo from ${esc(S)} to ${esc(E)}. <i>All rights to this report are reserved by ${CO} . ${CO} accepts no responsibility for any use of this report by third parties without prior written permission.</i></p>`);
  keep(`<div class="abbr">${H2('1.2', 'Abbreviations and signs')}
    <p>KM = Kilometer(s)</p><p>m = meter(s)</p><p>w = Width of an obstacle</p><p>H= Height of an obstacle</p><p>HR/L/M= Height in the right/left/middle side of an obstacle</p></div>`);
  flow(el(`<div class="sym"><img src="${A.iconTurn}" style="height:7mm" alt=""><img src="${A.iconTurn}" style="height:7mm;transform:scaleX(-1)" alt=""><span>= left and right turns which may become critical based on the trailer combination and final details of the cargo.</span></div>`));
  flow(el(`<p style="margin-top:5mm">Yellow arrows shown on the photographs indicate the direction of travel and the angle from which each photograph was taken.</p>`));
  flow(el(`<div class="sym"><svg width="9mm" height="11mm" viewBox="0 0 100 120" aria-hidden="true"><polygon points="50,0 100,55 75,55 75,120 25,120 25,55 0,55" fill="#FFFF00"/></svg><span>=Showing the direction of transportation and angle of the photo.</span></div>`));
  flow(el(`<div class="sym" style="display:block"><img src="${A.barGreen}" style="height:5mm;width:22mm;vertical-align:middle" alt=""> = Numbering of the figures which are presented to provide more information regarding an obstacle or showing the bypass road of an obstacle is highlighted with green.</div>`));
  flow(el(`<div class="sym" style="display:block"><img src="${A.barRed}" style="height:5mm;width:22mm;vertical-align:middle" alt=""> = Overhead obstacles or cables which are having insufficient clearance height are highlighted with red. These obstacles must be either bypassed or removed.</div>`));
  flow(el(`<div class="sym"><img src="${A.compassK}" style="height:14mm" alt=""><img src="${A.compassN}" style="height:14mm" alt=""><span>= N and K directıon shows north.</span></div>`));

  // 1.3 Route map: labels and route line placed automatically from the survey coordinates
  const merc = lat => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
  function routeMap() {
    const g = A.routeGeo; // georeference of the base map: two control points
    const fx = (g.b.x - g.a.x) / (g.b.lon - g.a.lon), fy = (g.b.y - g.a.y) / (merc(g.b.lat) - merc(g.a.lat));
    const X = lon => (g.a.x + (lon - g.a.lon) * fx) * 100, Y = lat => (g.a.y + (merc(lat) - merc(g.a.lat)) * fy) * 100;
    const pts = (A.routeLine || main.filter(r => r.latDec != null).map(r => [r.latDec, r.lonDec])).map(q => [X(q[1]), Y(q[0])]);
    if (pts.length < 2) return '';
    // midpoint along the route for the distance label
    let tot = 0; const seg = pts.slice(1).map((p, i) => { const d = Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]); tot += d; return d; });
    let acc = 0, mid = pts[0];
    for (let i = 0; i < seg.length; i++) { if (acc + seg[i] >= tot / 2) { const t = (tot / 2 - acc) / seg[i]; mid = [pts[i][0] + t * (pts[i + 1][0] - pts[i][0]), pts[i][1] + t * (pts[i + 1][1] - pts[i][1])]; break; } acc += seg[i]; }
    const s = pts[0], e = pts[pts.length - 1];
    // label boxes sit right next to their point; the side with the fewest route points under it wins
    const size = t => { const ls = t.split('\n'); return [Math.max(...ls.map(l => l.length)) * 1.12 + 3.2, ls.length * 4.6 + 2.2]; };
    function place(p, t, gap, taken) {
      const [w, h] = size(t);
      const cands = [[w / 2 + gap, 0], [0, -(h / 2 + gap * 1.3)], [0, h / 2 + gap * 1.3], [-(w / 2 + gap), 0],
                     [w / 2 + gap, -(h / 2 + gap)], [w / 2 + gap, h / 2 + gap], [-(w / 2 + gap), -(h / 2 + gap)], [-(w / 2 + gap), h / 2 + gap]];
      let best = null;
      for (const [dx, dy] of cands) {
        const cx = p[0] + dx, cy = p[1] + dy, x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
        let cost = pts.filter(q => q[0] > x0 - 1 && q[0] < x1 + 1 && q[1] > y0 - 1.5 && q[1] < y1 + 1.5).length;
        if (x0 < 1 || x1 > 99 || y0 < 1 || y1 > 99) cost += 1000;
        for (const k of taken) if (x0 < k[1] && x1 > k[0] && y0 < k[3] && y1 > k[2]) cost += 1000;
        if (!best || cost < best.cost) best = { cost, cx, cy, box: [x0, x1, y0, y1] };
      }
      taken.push(best.box);
      return `<div class="lbl" style="left:${best.cx.toFixed(2)}%;top:${best.cy.toFixed(2)}%">${esc(t)}</div>`;
    }
    const taken = [];
    const two = t => t.length > 16 && t.includes(' ') ? t.replace(/ (\S+)$/, '\n$1') : t;
    const labels = place(s, two(S), 2.2, taken) + place(e, two(E), 2.2, taken) + place(mid, stats.distance + ' Km', 1.6, taken);
    return `<div class="map">${A.routeBase ? `<img src="${A.routeBase}" style="aspect-ratio:${g.aspect}" alt="">` : `<div style="aspect-ratio:${g.aspect};background:#EEF1F4"></div>`}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <polyline points="${pts.map(p => p.map(v => v.toFixed(2)).join(',')).join(' ')}" fill="none" stroke="#1A5FE0" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
      </svg>
      ${[s, e].map(p => `<svg style="position:absolute;left:calc(${p[0]}% - 1.6mm);top:calc(${p[1]}% - 1.6mm);width:3.2mm;height:3.2mm" viewBox="0 0 10 10" aria-hidden="true"><circle cx="5" cy="5" r="4.6" fill="#C00000"/></svg>`).join('')}
      ${labels}
    </div>`;
  }
  keep(`${H2('1.3', 'Route')}${routeMap()}`);

  keep(`${H2('1.4', 'Obstacles on the route')}<p><b>Bridge:</b> All bridges along the route are classified as obstacles, and the load-bearing adequacy of each bridge must be verified before use. For loads with a gross combination weight (truck + trailer + cargo) exceeding 150 tonnes, a static load analysis of the bridges in accordance with the AASHTO code must be prepared and submitted to the General Directorate of Highways of Türkiye (KGM) to obtain the required road permit. KGM may decline to issue a crossing permit even where the calculations demonstrate sufficient structural capacity.</p>`);
  [
    'The span lengths and current structural condition of the bridges are documented in this survey. The axle configuration of the transport system must be determined accordingly before crossing the bridges.',
    'Where the capacity of a bridge is insufficient, structural strengthening may be considered: the existing bridge members can be reinforced, or a temporary flyover bridge can be installed over the bridge for the duration of the crossing. Both measures are subject to the approval of the competent authority. Highway bridges are generally under the jurisdiction of KGM, while some urban bridges are owned by local authorities or municipalities.',
    'Strengthening is not always a viable solution, as it may be uneconomical or impractical depending on the length and structural type of the bridge. An alternative is the construction of a temporary bypass road alongside the bridge, provided that the water flow is low and the riverbed is shallow. In this case, the bypass road is formed by placing culvert pipes in the riverbed, followed by backfilling and compaction. Riverbeds are generally under the jurisdiction of the General Directorate of State Hydraulic Works (DSİ), whose permission must be obtained. Where the bypass road crosses private land, the consent of the landowner is also required.',
    '<b>Power Lines:</b> Several power lines take place crossing the road one side to another on the transportation route. These are cables for industrial or urban electricity and can be classified as per below:',
  ].forEach(t => flow(el(`<p>${t}</p>`)));
  flow(el(`<ol class="alpha"><li><b>High Voltage Power Lines:</b> Transmission lines between cities carrying high voltage. They present a potential flashover (arc) risk to the cargo within a distance of 3 to 4 metres.</li>
    <li><b>Medium Voltage Power Lines:</b> Distribution lines within urban areas. They present a flashover (arc) risk within a distance of 0.5 to 3 metres.</li>
    <li><b>Low Voltage Power Lines:</b> Distribution lines within urban areas. They present no flashover risk unless contacted (a clearance of 15 cm is sufficient) and can be lifted using an insulated stick.</li></ol>`));
  [
    'De-energising high voltage power lines requires permits and escorts from the relevant electricity authority. For other lines, the necessary arrangements can be made through the local authorities. The high and medium voltage power lines identified along the route are presented in this report.',
    '<b>Overhead Structure:</b> Overhead Structure can be an obstacle to the transportation when passing under them. When passing beneath a structure, heights must be regarded since widths are adequate for current transportation. For this route, most common overhead structures are bridges, traffic light and signboards. Some of the structures may be lifted up with the permission of local authorities and some of them may be by-passed.',
    '<b>Left and Right Turns and Curves:</b> Considering the transportation combination and also dimensions of the cargo, turns are crucial obstacles for transportation. In this route survey report, critical turns and curves are determined and for long trailer combinations and long cargoes the turns should be inspected by detail and civil work requirement should be determined.',
    '<b>Inclinations and Declinations:</b> The possibility of the transportation over the inclinations and declinations should be calculated carefully by taking into account the weight of the cargo, transportation system, degree of inclination and road condition.',
  ].forEach(t => flow(el(`<p>${t}</p>`)));

  const pt = r => r ? `${esc(tr(r.lat))} ${esc(tr(r.lon))}` : '';
  keep(`${H2('1.5', 'Brief Information')}<table class="brief">
    <tr><td>Starting Point:</td><td>${esc(S)}(<a href="${mapsUrl(stats.first)}">${pt(stats.first)}</a>)</td></tr>
    <tr><td>End Point:</td><td>${esc(E)}(<a href="${mapsUrl(stats.last)}">${pt(stats.last)}</a>)</td></tr>
    <tr><td>Survey Date:</td><td>${esc(P.surveyDate)}</td></tr>
    <tr><td>Executed By:</td><td>${esc(P.executedBy)}</td></tr>
    <tr><td>Total Distance:</td><td>${stats.distance} km</td></tr>
    <tr><td>Total Number of Bridges:</td><td>${stats.bridges}</td></tr>
    <tr><td>Total Number of Left/Right Turns and Curves:</td><td>${stats.turns}</td></tr>
    <tr><td>Total Number of Overhead Structures:</td><td>${stats.overhead}</td></tr></table>`);
  keep(`<div style="margin-top:7mm">${H1('2', 'Transportation Drawing')}</div><p>Preliminary transport drawing.</p>`);

  // ---------- 2 drawing page (uploaded PDF page, keeps its own size) ----------
  for (const d of A.drawings || []) {   // PDF drawing: one page each, landscape pages on A3 landscape
    if (d.landscape) { const pg = newPage('a3'); pg.appendChild(el(`<img src="${d.src}" style="position:absolute;inset:6mm;width:calc(100% - 12mm);height:calc(100% - 12mm);object-fit:contain" alt="">`)); }
    else { const pg = newPage('text'); pg.appendChild(el(`<div class="content" style="display:flex;align-items:center;justify-content:center"><img src="${d.src}" style="max-width:100%;max-height:100%" alt=""></div>`)); }
  }
  if (A.drawing) {
    if (A.drawingLandscape) { const pg = newPage('a3'); pg.appendChild(el(`<img src="${A.drawing}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain" alt="">`)); }
    else { const pg = newPage('text'); pg.appendChild(el(`<div class="content" style="display:flex;align-items:center;justify-content:center"><img src="${A.drawing}" style="max-width:100%;max-height:100%" alt=""></div>`)); }
  }

  // ---------- 3 Route Survey ----------
  flowPage();
  keep(`${H1('3', 'Route Survey')}<p>The following tables present the latitude, longitude and chainage (distance from the starting point) of each obstacle. Obstacles are numbered so that bypass roads, satellite views and other supplementary records can be readily identified.</p>
    <p>In addition, some photographs without obstacles are included to document the road type; no mitigation is required for these. Where necessary, a satellite view is provided to illustrate the bypass road.</p>`);
  flowArea = null;

  const hl = r => window.SurveyRules.highlightOf(r, { general: !!P.general, minHeight: P.minHeight, refLV: P.refLV, refMV: P.refMV, refHV: P.refHV });
  const PHOTO_PT = 297; // Excel photo width in pt, used to scale overlay text and lines
  const BOXA = (0.604 * 185) / 82;
  function overlays(r) {
    let html = '', svg = '';
    const W = 1000, H = 1000 / BOXA;
    for (const o of r.overlays || []) {
      const tr = `rotate(${o.rot || 0}deg) scale(${o.flipH ? -1 : 1},${o.flipV ? -1 : 1})`;
      // Excel 3D camera presets (arrows drawn lying on the road)
      const cam = o.camera ? (/OffAxis1/.test(o.camera) ? ' rotateX(58deg) rotateZ(-50deg)' : / OffAxis2|OffAxis2/.test(o.camera) ? ' rotateX(58deg) rotateZ(50deg)' : ' rotateX(55deg)') : '';
      const box = `left:${o.x * 100}%;top:${o.y * 100}%;width:${o.w * 100}%;height:${o.h * 100}%;transform:${tr}${cam}`;
      if (o.kind === 'pic' && o.img) html += `<div class="ov" style="${box}"><img src="${o.img}" alt=""></div>`;
      else if (o.kind === 'sp' && o.geom === 'upArrow') {
        html += `<div class="ov" style="${box}"><svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:100%;display:block" aria-hidden="true"><polygon points="50,0 100,50 75,50 75,100 25,100 25,50 0,50" fill="${o.fill || '#FFFF00'}"/></svg></div>`;
      } else if (o.kind === 'sp') {
        const runs = (o.text || []).map(p => p.map(t => `<span style="font-size:${(t.sz / PHOTO_PT * 100).toFixed(2)}cqw;${t.b ? 'font-weight:700;' : ''}${t.color ? 'color:' + t.color : ''}">${esc(t.t)}</span>`).join('')).join('<br>');
        const border = o.line ? `border:${Math.max(0.6, (o.lw || 0.75) / PHOTO_PT * 100 * 0.6).toFixed(2)}cqw solid ${o.line};` : '';
        const bg = o.fill ? `background:${o.fill};` : '';
        html += `<div class="ov txt" style="${box};${border}${bg}"><div>${runs}</div></div>`;
      } else if (o.kind === 'cxnSp') {
        let x1 = o.x * W, y1 = o.y * H, x2 = (o.x + o.w) * W, y2 = (o.y + o.h) * H;
        if (o.flipH) [x1, x2] = [x2, x1];
        if (o.flipV) [y1, y2] = [y2, y1];
        const sw = Math.max(2, (o.lw || 1.5) / PHOTO_PT * W);
        const id = 'm' + Math.random().toString(36).slice(2, 8);
        svg += `<defs><marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${o.line}"/></marker></defs>
          <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${o.line}" stroke-width="${sw}" ${o.head && o.head !== 'none' ? `marker-start="url(#${id})"` : ''} ${o.tail && o.tail !== 'none' ? `marker-end="url(#${id})"` : ''}/>`;
      }
    }
    if (svg) html += `<svg class="ovs" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${svg}</svg>`;
    return html;
  }
  function photo(r) {
    const c = r.crop || {}; const l = c.l || 0, t = c.t || 0, rr = c.r || 0, b = c.b || 0;
    const w = 100 / (1 - l - rr), h = 100 / (1 - t - b);
    const marks = (r.ann || []).length && window.annHtml ? `<div style="position:absolute;inset:0;container-type:inline-size;pointer-events:none">${annHtml(r.ann, -1)}</div>` : overlays(r);
    return `<div class="crop">${r.photo ? `<img src="${r.photo}" style="width:${w}%;height:${h}%;left:${-l * w}%;top:${-t * h}%" alt="">` : ''}</div>${marks}`;
  }
  const cell = (row, col, cls, html, span) => `<div class="${cls}" style="grid-row:${row}${span ? ' / span ' + span : ''};grid-column:${col}">${html}</div>`;
  function table(r) {
    const no = r.no.replace('-', ' - ');
    let h = cell(1, 1, 'c b bd', '#') + cell(1, 2, 'c b bd', 'KM') + cell(1, 3, 'c b bb', 'OBSTACLE');
    h += r.flag ? cell(2, 1, 'no flag bd', `<span>${esc(no)}</span><span class="f">${r.flag}</span>`, 2) : cell(2, 1, 'no bd', esc(no), 2);
    h += cell(2, 2, 'c bd', km1(r.km), 2) + cell(2, 3, 'c bb', esc(window.OL ? OL(r.obstacle) : r.obstacle), 2);
    h += `<div class="c b bd" style="grid-row:4;grid-column:1 / 3">Latitude:</div>` + cell(4, 3, 'c bb lnk', `<a href="${mapsUrl(r)}">${esc(tr(r.lat))}</a>`);
    h += `<div class="c b bd" style="grid-row:5;grid-column:1 / 3">Longitude:</div>` + cell(5, 3, 'c bb lnk', `<a href="${mapsUrl(r)}">${esc(tr(r.lon))}</a>`);
    h += `<div class="c b bb rem ${hl(r) ? 'hl-' + hl(r) : ''}" style="grid-row:6">REMARKS</div>`;
    const lab = (i, t) => `<div class="lab" style="grid-row:${7 + i};grid-column:1 / 3">${t}</div>`;
    const glab = (i, t) => `<div class="lab c" style="grid-row:${7 + i};grid-column:2">${t}</div>`;
    const val = (i, t, sm) => `<div class="val ${sm ? 'sm' : ''}" style="grid-row:${7 + i};grid-column:3">${esc(t)}</div>`;
    const txt = (i, t) => `<div class="txt" style="grid-row:${7 + i} / 17">${esc(t)}</div>`;
    const f = r.fields || {}, W = (r.widths || []).filter(w => w.value != null && w.value !== '');
    if (r.obstacle === 'Overhead Structure' || r.obstacle === 'Overhead Cable') {
      h += lab(0, r.obstacle === 'Overhead Cable' ? 'Line Type:' : 'Structure Type:') + val(0, f.type, true) + lab(2, 'Dimensions:');
      const hs = r.heights.length ? r.heights : [{ label: 'H', value: '' }];
      hs.slice(0, 2).forEach((x, i) => { const row = hs.length > 1 ? 3 + i : 4; h += glab(row, esc(x.label) + '(m):') + val(row, num(x.value)); });
      h += lab(5, 'Actions:') + txt(6, r.actions);
    } else if (r.obstacle === 'Bridge') {
      h += lab(0, 'Bridge Name:') + val(0, f.name, true) + lab(1, 'Bridge Type:') + val(1, f.type) + (W[0] ? lab(2, esc(W[0].label) + '(m):') + val(2, num(W[0].value)) : '') + lab(3, 'Bridge Spans:') + val(3, f.spans) + lab(5, 'Remarks:') + txt(6, r.remarks);
    } else if (r.obstacle === 'Culvert') {
      h += lab(0, 'Culvert Type:') + val(0, f.type, true) + (W[0] ? lab(1, esc(W[0].label) + '(m):') + val(1, num(W[0].value)) : '') + lab(2, 'Culvert Spans:') + val(2, f.spans) + lab(5, 'Remarks:') + txt(6, r.remarks);
    } else if (W.length) {   // widths entered (gates, width obstructions…)
      h += lab(0, 'Dimensions:');
      W.slice(0, 3).forEach((w, i) => { h += glab(1 + i, esc(w.label) + '(m):') + val(1 + i, num(w.value)); });
      h += txt(Math.min(3, W.length) + 2, r.remarks);
    } else {
      h += `<div class="free">${esc(r.remarks)}</div>`;
    }
    return `<div class="tb">${h}</div>`;
  }
  // new draft: the landscape summary and record pages built by report2.html go here, numbered with the rest
  if (window.R2_PAGES) for (const html of window.R2_PAGES) newPage(window.R2_MODE === 'p' ? 'lp pp' : 'lp').insertAdjacentHTML('afterbegin', html);
  else for (let i = 0; i < R.length; i += 3) {
    const pg = newPage('pg-survey');
    if (i === 0) pg.querySelector('.hdr') && (pg.dataset.toc3 = '1');
    pg.appendChild(el(`<div class="survey">${R.slice(i, i + 3).map(r => `<div class="blk"><div class="ph">${photo(r)}</div>${table(r)}</div>`).join('')}</div>`));
  }

  // ---------- 4 Conclusion ----------
  flowPage();
  const fig = (src, cap) => `<figure class="ref" style="width:${Math.min(150, 105 * (A.refAR[src] || 1.6)).toFixed(1)}mm"><img src="${A.ref[src]}" style="aspect-ratio:${A.refAR[src] || 1.6}" alt="">${cap ? `<figcaption>${cap}</figcaption>` : ''}</figure>`;
  const CB = {
    done_ok: 'A static load analysis of all bridges on the transportation route has been carried out. The results confirm that all bridges have adequate load-bearing capacity for the planned axle loads, and no further mitigation is required.',
    required: 'A static load analysis of the bridges on the transportation route must be carried out prior to transport, and the results must be submitted to the relevant authorities to obtain the road permit.',
  };
  keep(`${H1('4', 'Conclusion')}${H2('4.1', 'Bridge')}<p>${P.conclusion.bridge === 'custom' ? esc(P.conclusion.bridgeText) : (CB[P.conclusion.bridge] || '')}</p><p>Examples of critical bridges crossed using different methods during previous ÇABA MİSNAK operations:</p>`);
  [['r17', 'Crossing Using a Temporary Flyover Bridge'], ['r18', 'Load Distribution Using a Girder Bridge System'], ['r23', 'Load Distribution over the Bridge'],
   ['r24', 'Construction of a Bypass Road'], ['r25', 'Construction of Bypass Road'], ['r30', 'Construction of Bypass Road'], ['r31', 'Construction of Bypass Road']].forEach(([s, c]) => flow(el(fig(s, c))));
  keep(`${H2('4.2', 'Overhead Structures')}<p>The location, dimensions and bypass options of all overhead structures are provided in the route survey section. Using a girder bridge transport system, all overhead obstacles on this route can be passed underneath, and no further mitigation is required.</p><p>Examples of overhead obstacles lifted during previous ÇABA MİSNAK operations:</p>`);
  [['r36', 'Pedestrian Bridge Lifting – Türkiye'], ['r37', 'Traffic Light Lifting – Türkiye'], ['r42', 'Moving the Cargo over an Obstacle Using a Crane – Georgia']].forEach(([s, c]) => flow(el(fig(s, c))));
  const mg = stats.maxGrade ? stats.maxGrade.v : 0;
  keep(`${H2('4.3', 'Inclination and declination')}<p>Inclines and declines along the transportation route are identified and documented in this route survey. The number of puller trucks required must be calculated on the basis of the gross combination weight, the transport system, the gradient and the road surface condition.</p>
    ${mg ? `<p>The most serious inclination observed in this route survey is approximately ${num(mg)}% and the road is paved with asphalt in this place.</p>` : ''}<p>Examples of inclined roads during previous ÇABA MİSNAK operations:</p>`);
  [['r43', '%12 Inclination – Kazakhstan –<br>580ton load + Transporter load'], ['r48', '%14 Inclination – Turkey –<br>600ton load + Transporter load'], ['r49', '%4 Inclination – Turkey –<br>2650ton load + Transporter load']].forEach(([s, c]) => flow(el(fig(s, c))));
  keep(`${H2('4.4', 'Power lines and cables')}<p>Low voltage power lines along the transportation route can be lifted or temporarily removed with the permission of the local authorities. De-energising high voltage power lines requires permits and escorts from the relevant electricity authority.</p>
    <p>For reference, the minimum clearance distances for passing under exposed electrical equipment or conductors are given in the table below:</p>`);
  flow(el(`<table class="clear"><tr><th rowspan="2">Voltage</th><th colspan="2">Minimum clearance distance for<br>passing under exposed electrical<br>equipment or conductors</th></tr>
    <tr><th>Metres</th><th>Feet</th></tr><tr><td>Phase to Phase</td><td></td><td></td></tr><tr><td>Over 750 V to 75 kV</td><td>2</td><td>6,5</td></tr>
    <tr><td>Over 75 kV to 250 kV</td><td>3</td><td>10</td></tr><tr><td>Over 250 kV to 550 kV</td><td>4</td><td>13</td></tr></table>`));
  flow(el(`<p>Examples of passing under power lines during previous ÇABA MİSNAK operations:</p>`));
  [['r54', 'Shutdown and Lifting'], ['r55', 'Excavation, Shutdown and Lifting'], ['r60', 'Shut Down and Lifting']].forEach(([s, c]) => flow(el(fig(s, c))));
  keep(`${H2('4.5', 'Curves and turns')}<p>All critical curves on this route are presented in this report, together with the related swept-path simulations where applicable.</p>`);
  [['r61', 'L:36m, W:15m, H:13m<br>Weight:2650Ton'], ['r66', 'L:78m, W:5.5m, H:6.5m<br>Weight:484Ton'], ['r67', 'Girder L:50m, W:7.2m, H:6.1m<br>Weight:600Ton'],
   ['r72', 'L:72m, W:10m, H:13m<br>Weight:712Ton'], ['r73', 'Girder L:63m, W:12m, H:18m<br>Weight:850Ton']].forEach(([s, c]) => flow(el(fig(s, c))));
  keep(`${H2('4.6', 'Road condition')}<p>${P.conclusion.road === 'custom' ? esc(P.conclusion.roadText) : 'The road condition on this route is suitable for the planned transportation. The entire route is asphalt-paved with no critical pinch points.'}</p><p>Examples of passing through narrow roads during previous ÇABA MİSNAK operations:</p>`);
  [['r78', ''], ['r79', '']].forEach(([s, c]) => flow(el(fig(s, c))));
  keep(`${H2('4.7', 'Climate conditions')}<p>Transportation during the winter season is not recommended, as low temperatures affect both the performance of the hydraulic trailer and the road surface. A frozen road surface reduces friction, lowering the effective tractive force and increasing braking distances, which results in hazardous transport conditions.</p>`);
  flow(el(`<p>Transportation during the rainy season must also be planned in advance, as the number of puller trucks must be determined based on the condition of the road surface.</p>`));
  keep(`${H2('4.8', 'Permissions')}<p>In addition to road permits, the implementation of all mitigation measures presented in this report is subject to the approval of the relevant authorities.</p>`);

  // ---------- fill contents page numbers ----------
  const at = {};
  pages.forEach(pg => pg.querySelectorAll('[data-toc]').forEach(h => { at[h.dataset.toc] ||= pg.dataset.no; }));
  const firstSurvey = pages.find(pg => pg.classList.contains('pg-survey'));
  document.querySelectorAll('.toc .pg').forEach(s => { s.textContent = at[s.dataset.for] || ''; });
  document.querySelectorAll('.page.lp > .pno').forEach(s => { s.textContent = `${s.textContent} / ${pageNo}`; });
  window.REPORT_STATS = { pages: pages.length, numbered: pageNo, toc: at, firstSurvey: firstSurvey && firstSurvey.dataset.no, maxGrade: stats.maxGrade && { no: stats.maxGrade.r.no, v: stats.maxGrade.v }, stats: { bridges: stats.bridges, turns: stats.turns, overhead: stats.overhead, distance: stats.distance } };
  document.body.dataset.ready = '1';
})();
