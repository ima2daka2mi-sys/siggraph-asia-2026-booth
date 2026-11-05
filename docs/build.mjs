// 帳票PDF（英語）の生成：index.html の EQ / LAN と造作の座標から帳票HTMLを作り、Edge のヘッドレス印刷でPDF化する
//   node docs/build.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(DIR, 'src');
// headless browser for printing: Chrome first (Edge 11/2026 exits without writing the PDF), then Edge
const BROWSER = process.env.BROWSER || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const ISSUED = process.env.ISSUED || new Date().toISOString().slice(0, 10);
const page = fs.readFileSync(path.join(DIR, '..', 'index.html'), 'utf8');

// ---- plan geometry (mm, same as index.html: x → side D, y → front A; booth drawings A004.1–A009) ----
function bandPts(p1, p2, th, off = 0) {
  const [x1, y1] = p1, [x2, y2] = p2, L = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / L, uy = (y2 - y1) / L, nx = uy, ny = -ux, o1 = off - th / 2, o2 = off + th / 2;
  return {pts: [[x1 + nx * o1, y1 + ny * o1], [x2 + nx * o1, y2 + ny * o1], [x2 + nx * o2, y2 + ny * o2], [x1 + nx * o2, y1 + ny * o2]], n: [nx, ny]};
}
const U45 = [Math.SQRT1_2, Math.SQRT1_2], N45 = [Math.SQRT1_2, -Math.SQRT1_2]; // along the diagonal walls / toward their counter side
const along = (p, s, o = 0) => [p[0] + U45[0] * s + N45[0] * o, p[1] + U45[1] * s + N45[1] * o];
const fA = [121, 564], fB = [1323, 1766], fF = [210, 476]; // F8VPS wall ends / start of its counter-side face
const sF = [1740, 2884];                                    // ForumSync wall: start of its counter-side face
const fw = bandPts(fA, fB, 250);
const fMid = along(fF, 850, 120), sMid = along(sF, 725, 120);
const SW = [[1740, 2884], [2800, 3944], [2800, 5944], [2501, 5944], [2501, 4069], [1528, 3096]]; // ForumSync wall outline

function grab(name) {
  const i = page.indexOf(`const ${name}=[`);
  if (i < 0) throw new Error(`${name} not found in index.html`);
  let d = 0, j = page.indexOf('[', i);
  for (let k = j; k < page.length; k++) { if (page[k] === '[') d++; else if (page[k] === ']' && --d === 0) return vm.runInNewContext(page.slice(j, k + 1), {fMid, sMid, fw, along, Math}); }
}
const EQ = grab('EQ'), LAN = grab('LAN');

// wall-mounted screens: centre height (m) and the wall they hang on, from the tv() calls in index.html
const MOUNT = {
  2: {h: 1.6, n: [-N45[0], -N45[1]], wall: ['ForumSync壁（VR360側）', 'ForumSync wall, VR360 side']},
  5: {h: 1.6, n: N45, wall: ['F8VPS壁（カウンター側）', 'F8VPS wall, counter side']},
  6: {h: 1.6, n: [-N45[0], -N45[1]], wall: ['F8VPS壁（ホログラム側）', 'F8VPS wall, hologram side']},
  7: {h: 1.6, n: N45, wall: ['ForumSync壁（カウンター側）', 'ForumSync wall, counter side']},
  8: {h: 1.6, n: [-1, 0], wall: ['STOCK B側面', 'STOCK, side-B face']},
  9: {h: 1.7, n: [1, 0], wall: ['ForumSync壁 D側面', 'ForumSync wall, side-D face']},
  11: {h: 1.6, n: [0, 1], wall: ['STOCK 前面（A側）', 'STOCK, front face (side A)']},
};
const IN = {2: 43, 5: 50, 6: 65, 7: 50, 8: 32, 9: 85, 11: 43};
const SCREEN_W = {32: 715, 43: 952, 50: 1107, 65: 1439, 85: 1882}; // panel width mm, same as index.html

const en = v => Array.isArray(v) ? v[1] : v;
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const tx = v => esc(en(v)).replace(/approx\. ?/g, '≈ '); // documents are English only; '≈' keeps the tables compact
const fmt = n => n.toLocaleString('en-US');
const outlets = e => e.outlets ?? (e.w ? e.qty : 0); // an outlet with no fixed load (STOCK) sets outlets itself
const totalW = EQ.reduce((s, e) => s + e.w * e.qty, 0), totalOut = EQ.reduce((s, e) => s + outlets(e), 0);
const lanPorts = LAN.reduce((s, l) => s + l.ports, 0);
const PC = EQ.find(e => e.no === '+');
const PC_AT = {L1: 2, L2: 2, L3: 3, L4: 3, L5: 1, L6: 1, L7: 1};
if (Object.values(PC_AT).reduce((a, b) => a + b, 0) !== PC.qty) throw new Error(`PC_AT must add up to ${PC.qty} laptops`);
const pcAt = Object.entries(PC_AT).map(([no, n]) => ({l: LAN.find(x => x.no === no), n}));

// ---- plan drawing (SVG, 1 unit = 1 mm) ----
const P = pts => pts.map(p => p.map(v => v.toFixed(0)).join(',')).join(' ');
const rect = (x1, y1, x2, y2, cls) => `<rect class="${cls}" x="${x1}" y="${y1}" width="${x2 - x1}" height="${y2 - y1}"/>`;
const TAG_AT = {L1: [1800, 800], L2: [3250, 3150], L5: [1600, 4000], L9: [1000, 2350]}; // tag positions when drawn together with the pins
// where a pin's label goes when the default (right of the pin) would collide: [dx, dy, text-anchor]
const LABEL_AT = {2: [-230, 0, 'end'], 6: [-230, 0, 'end'], 8: [-230, 0, 'end'], 11: [0, -290, 'middle'], S: [-230, 0, 'end']};
function plan({pins = null, label = null, lan = false, screens = false, pcs = false, h = '120mm'} = {}) {
  const s = [];
  s.push(rect(0, 0, 6000, 6000, 'carpet'));
  // floor areas and furniture
  s.push(rect(227, 4255, 2274, 5504, 'area'), `<text class="area-t" x="1250" y="5640">VR360 2047×1250</text>`);
  s.push(`<polygon class="stand" points="${P(bandPts(along(fF, 50), along(fF, 1650), 400, 200).pts)}"/>`, `<polygon class="stand" points="${P(bandPts(along(sF, 75), along(sF, 1375), 400, 200).pts)}"/>`);
  [3750, 5050].forEach(x => s.push(rect(x, 3799, x + 600, 5999, 'table')));                  // driving counters 2200×600 H1100
  [[4040, 1939], [3206, 5599]].forEach(([x, y]) => s.push(`<circle class="table" cx="${x}" cy="${y}" r="300"/>`));
  s.push(`<circle class="table" cx="470" cy="1705" r="250"/>`);                               // hologram stand
  s.push(rect(5055 - 400, 2160 - 400, 5055 + 400, 2160 + 400, 'unit'));                       // motion seat 800×800
  [3744, 5843].forEach(y => s.push(`<line class="pole" x1="452" y1="${y}" x2="1352" y2="${y}"/>`, `<circle class="post" cx="452" cy="${y}" r="45"/><circle class="post" cx="1352" cy="${y}" r="45"/>`));
  // walls H3000
  [[3000, 0, 3150, 50], [4000, 0, 6000, 50], [3000, 50, 3050, 1500], [3050, 1450, 5950, 1500], [5950, 50, 6000, 1450]].forEach(r => s.push(rect(...r, 'wall')));
  s.push(`<polygon class="wall" points="${P(fw.pts)}"/>`);
  s.push(`<polygon class="wall" points="${P(SW)}"/>`);
  s.push(`<path class="door" d="M3150 50 L3150 900 A850 850 0 0 0 4000 50"/>`);
  // area names
  [['STOCK 3000×1500', 4500, 900], ['F8VPS', ...along(fF, 850, 950)], ['ForumSync', ...along(sF, 725, 1000)], ['DRIVING ×6', 4700, 3650]].forEach(([t, x, y]) => s.push(`<text class="name" x="${x.toFixed(0)}" y="${y.toFixed(0)}">${t}</text>`));
  s.push(`<text class="door-t" x="3575" y="1150">DOOR W850 (lockable)</text>`);
  // sides (booth drawings: A front, B left, C back, D right)
  s.push(`<text class="side" x="3000" y="6420">A  FRONT (aisle)</text>`, `<text class="side" x="3000" y="-260">C  BACK (aisle)</text>`,
    `<text class="side" transform="translate(6330 3000) rotate(90)">D  RIGHT (aisle)</text>`, `<text class="side" transform="translate(-330 3000) rotate(-90)">B  LEFT (aisle)</text>`);
  // overall dimensions
  s.push(`<g class="dim"><line x1="0" y1="6700" x2="6000" y2="6700"/><line x1="0" y1="6620" x2="0" y2="6780"/><line x1="6000" y1="6620" x2="6000" y2="6780"/><text x="3000" y="6660">6000</text>
    <line x1="6700" y1="0" x2="6700" y2="6000"/><line x1="6620" y1="0" x2="6780" y2="0"/><line x1="6620" y1="6000" x2="6780" y2="6000"/><text transform="translate(6770 3000) rotate(90)">6000</text></g>`);
  // LAN tags: drop point (dot) plus a tag with the port count; tags that would sit on a pin are moved aside with a leader line
  if (lan) LAN.forEach(l => {const [x, y] = l.pos, [tx, ty] = pins && TAG_AT[l.no] || l.pos;
    if (tx !== x || ty !== y) s.push(`<line class="lead" x1="${x}" y1="${y}" x2="${tx}" y2="${ty}"/>`);
    s.push(`<rect class="landot" x="${x - 55}" y="${y - 55}" width="110" height="110"/>`);
    s.push(`<g class="lan big"><rect x="${tx - 330}" y="${ty - 210}" width="660" height="420" rx="50"/><text x="${tx}" y="${ty - 85}">${l.no}</text><text class="pt" x="${tx}" y="${ty + 105}">${l.ports} port${l.ports > 1 ? 's' : ''}</text></g>`);});
  // laptop outlets at their LAN drops (power plan)
  if (pcs) pcAt.forEach(({l, n}) => {const [x, y] = l.pos, [tx, ty] = pins && TAG_AT[l.no] || l.pos;
    if (tx !== x || ty !== y) s.push(`<line class="lead" x1="${x}" y1="${y}" x2="${tx}" y2="${ty}"/>`);
    s.push(`<rect class="pcdot" x="${x - 55}" y="${y - 55}" width="110" height="110"/>`);
    s.push(`<g class="pc"><rect x="${tx - 380}" y="${ty - 210}" width="760" height="420" rx="50"/><text x="${tx}" y="${ty - 85}">PC ×${n}</text><text class="pt" x="${tx}" y="${ty + 105}">${fmt(n * PC.w)} W</text></g>`);});
  // wall-mounted screens drawn to width on the wall face they hang on
  if (screens) EQ.filter(e => MOUNT[e.no]).forEach(e => {const [x, y] = e.pos, [nx, ny] = MOUNT[e.no].n, w = SCREEN_W[IN[e.no]] / 2, cx = x + nx * 30, cy = y + ny * 30;
    s.push(`<line class="screen" x1="${cx - ny * w}" y1="${cy + nx * w}" x2="${cx + ny * w}" y2="${cy - nx * w}"/>`);});
  // equipment pins, optionally with a label beside them (the page's own figure: watts, screen size …)
  if (pins) EQ.filter(e => e.pos && pins(e)).forEach(e => {const [x, y] = e.pos, r = lan ? 150 : 170, t = label && label(e);
    s.push(`<g class="pin${lan ? ' dim2' : ' big'}"><circle cx="${x}" cy="${y}" r="${r}"/><text x="${x}" y="${y}">${e.no}</text></g>`);
    if (t) {const [dx, dy, a] = LABEL_AT[e.no] || [r + 40, 0, 'start']; s.push(`<text class="watt" x="${x + dx}" y="${y + dy}" text-anchor="${a}">${t}</text>`);}});
  return `<svg class="plan" style="height:${h}" viewBox="-700 -600 7700 7500" xmlns="http://www.w3.org/2000/svg">${s.join('')}</svg>`;
}

// ---- documents ----
const CSS = `
@page{size:A4;margin:14mm 12mm}
*{box-sizing:border-box}
body{margin:0;font-family:"Segoe UI",Arial,sans-serif;color:#15171b;font-size:11pt;line-height:1.4;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.sheet{break-after:page}.sheet:last-child{break-after:auto}
header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1f4e79;padding-bottom:6px;margin-bottom:10px}
h1{margin:0;font-size:19pt;letter-spacing:.02em}h1 small{display:block;font-size:10pt;font-weight:400;color:#555}
.meta{text-align:right;font-size:9.5pt;color:#444}.meta b{color:#15171b}
table{width:100%;border-collapse:collapse;font-size:10.5pt}
th,td{border:1px solid #b9bec6;padding:4px 6px;vertical-align:top;text-align:left}
th{background:#1f4e79;color:#fff;font-weight:700;font-size:10pt}
th small,td small{display:block;font-size:9pt;color:#666;font-weight:400}th small{color:#d6e2ef}
td.n,th.n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
td.c{text-align:center;white-space:nowrap}
td.no{text-align:center;font-weight:700;width:26px}
tfoot td{background:#eef3f8;font-weight:700}
.notes{margin:10px 0 0;padding-left:18px;font-size:10pt;color:#333}.notes li{margin:2px 0}
.wrap{margin-top:8px}.wrap .notes{margin-top:6px}
.plan{width:auto;display:block;margin:0 auto}
.plan .carpet{fill:#f4f5f6;stroke:#15171b;stroke-width:24}
.plan .wall{fill:#8a8d93;stroke:#3a3d42;stroke-width:10}
.plan .stand{fill:#dfe3e8;stroke:#7b8087;stroke-width:10}
.plan .area{fill:#e5efd9;stroke:#6a9a3a;stroke-width:10;stroke-dasharray:60 40}
.plan .area-t{font-size:115px;fill:#4f7a26;text-anchor:middle}
.plan .table{fill:#efe2c7;stroke:#a8875a;stroke-width:10}
.plan .unit{fill:none;stroke:#15171b;stroke-width:14;stroke-dasharray:40 30}
.plan .pole{stroke:#c0392b;stroke-width:30}.plan .post{fill:#5e6168}
.plan .door{fill:none;stroke:#3a3d42;stroke-width:10;stroke-dasharray:30 25}
.plan .door-t{font-size:125px;text-anchor:middle;fill:#3a3d42}
.plan .name{font-size:175px;font-weight:700;text-anchor:middle;fill:#3a3d42}
.plan .side{font-size:195px;font-weight:700;text-anchor:middle;fill:#1f4e79}
.plan .dim line{stroke:#555;stroke-width:12}.plan .dim text{font-size:175px;text-anchor:middle;fill:#333}
.plan .pin circle{fill:#1f4e79;stroke:#fff;stroke-width:24}.plan .pin text{fill:#fff;font-size:185px;font-weight:700;text-anchor:middle;dominant-baseline:central}
.plan .pin.big text{font-size:215px}
.plan .lan rect{fill:#ff9f1a;stroke:#15171b;stroke-width:14}.plan .lan text{fill:#15171b;font-size:180px;font-weight:700;text-anchor:middle;dominant-baseline:central}
.plan .lan.big rect{stroke-width:20}.plan .lan .pt{font-size:150px;font-weight:600}
.plan .screen{stroke:#15171b;stroke-width:70;stroke-linecap:butt}
.plan .pin.dim2 circle{fill:#6b7f95}
.plan .pc rect{fill:#fff;stroke:#c0392b;stroke-width:16}.plan .pc text{fill:#c0392b;font-size:170px;font-weight:700;text-anchor:middle;dominant-baseline:central}.plan .pc .pt{font-size:150px}
.plan .pcdot{fill:#c0392b}
.plan .lead{stroke:#15171b;stroke-width:12;stroke-dasharray:30 20}
.plan .watt{font-size:170px;font-weight:700;fill:#c0392b;dominant-baseline:central;paint-order:stroke;stroke:#fff;stroke-width:34px;stroke-linejoin:round}
.plan .landot{fill:#ff9f1a;stroke:#15171b;stroke-width:12}
.legend{display:flex;flex-wrap:wrap;gap:4px 16px;font-size:10pt;margin-top:6px;color:#333}.legend i{display:inline-block;width:14px;height:10px;margin-right:4px;vertical-align:-1px;border:1px solid #555}
table.spec{font-size:9pt;table-layout:fixed}table.spec th{font-size:9pt;padding:3px 5px}table.spec td{padding:2px 5px;overflow-wrap:anywhere}table.spec td.n{white-space:normal}
.pb{break-before:page}
h2.cont{font-size:13pt;margin:0 0 6px;color:#1f4e79}
.key{display:grid;grid-template-columns:1fr 1fr;gap:3px 18px;margin-top:8px;font-size:10pt;line-height:1.35}
.key span{display:flex;gap:6px;align-items:baseline}.key em{margin-left:auto;font-style:normal;font-weight:700;white-space:nowrap}
.key .kn,.key .kl{flex:none;min-width:26px;text-align:center;border-radius:3px;font-size:9.5pt;padding:0 3px}
.key .kn{background:#1f4e79;color:#fff}.key .kp{background:#fff;color:#c0392b;border:1px solid #c0392b}.key span:has(.kp) em{color:#c0392b}.key .kl{background:#ff9f1a;color:#15171b}
.key span:has(.kn) em{color:#c0392b}
.key .wide{grid-column:1/-1}.key .tot{border-top:1px solid #b9bec6;padding-top:3px;margin-top:2px;font-weight:700}
footer.src{margin-top:10px;font-size:9pt;color:#666}
`;
const head = (ttl, no) => `<header><h1>${ttl}</h1>
  <div class="meta"><b>SIGGRAPH Asia 2026 · FORUM8 Booth</b><br>Booth B37 · island 6000×6000 / booth drawings A004.1–A009 (4 Nov)<br>${no} / Issued ${ISSUED} / Draft</div></header>`;
const SOURCE = `<footer class="src">Source: equipment spec list, 30 Oct 2026 (draft) · Booth 3D: ima2daka2mi-sys.github.io/siggraph-asia-2026-booth</footer>`;
const legend = (o = {}) => `<div class="legend"><span><i style="background:#8a8d93"></i>Wall H3000</span><span><i style="background:#dfe3e8"></i>Counter H1010</span>
  <span><i style="background:#efe2c7"></i>Driving counter / table</span><span><i style="background:#e5efd9"></i>VR360 area</span><span><i style="background:#1f4e79"></i>Equipment no.</span>
  ${o.lan ? '<span><i style="background:#ff9f1a"></i>Wired LAN (ports)</span>' : ''}${o.pcs ? '<span><i style="background:#fff;border-color:#c0392b"></i>Laptop outlet (PC)</span><span><b style="color:#c0392b">W</b> Power</span>' : ''}${o.screens ? '<span><i style="background:#15171b;height:4px"></i>Screen width</span>' : ''}<span><i style="background:#c0392b"></i>Pole partition</span></div>`;

// a full A4 page for the plan; each document shows only its own figures on it, with a key underneath
const ports = n => `${n} port${n > 1 ? 's' : ''}`;
const kRow = (cls, no, text, val = '', wide = false) => `<span${wide ? ' class="wide"' : ''}><b class="${cls}">${no}</b>${text}<em>${val}</em></span>`;
const PLAN = {
  // the floor plan has no table, so its key names every number
  'floor-plan': {what: 'equipment positions', opt: {pins: () => true},
    key: () => EQ.filter(e => e.pos).map(e => kRow('kn', e.no, tx(e.name), e.qty > 1 ? `×${e.qty}` : '')).join('')},
  'power-list': {what: 'power at each position', opt: {pins: () => true, pcs: true, label: e => e.w ? `${fmt(e.w * e.qty)} W` : ''},
    key: () => `<span class="wide tot"><b>Total</b>${fmt(totalW)} W (≈ ${(totalW / 230).toFixed(1)} A at 230 V) · ${totalOut} outlets, all at floor level. Positions may be adjusted to suit site conditions.</span>`},
  'lan-locations': {what: 'wired LAN drops and ports', opt: {pins: () => true, lan: true},
    key: () => `<span class="wide tot"><b>Total</b>${LAN.length} drops · ${ports(lanPorts)}</span>`},
  'wall-mount': {what: 'screen size and position', opt: {pins: e => MOUNT[e.no], screens: true, label: e => `${IN[e.no]}"`}, key: () => ''},
};
const planPage = (k, title, first = false) => {const p = PLAN[k];
  return `${first ? '' : '<div class="pb"></div>'}<h2 class="cont">${title} — plan: ${p.what}</h2>${plan({...p.opt, h: '170mm'})}${legend(p.opt)}${p.key() ? `<div class="key">${p.key()}</div>` : ''}`;};

// each document = its table part + its plan page from PLAN (planFirst: plan before the table)
const DOCS = {
  'floor-plan': {title: 'Floor Plan', planOnly: true, notes: () => `
    <ul class="notes"><li>mm. Walls H3000, counters H1010, driving counters H1100; dashed: motion seat 800×800. The overhead sign (W5000×H1500) is not drawn.</li></ul>${SOURCE}`},

  'power-list': {title: 'Power List', table: () => `
    <table><thead><tr><th>No.</th><th>Equipment</th><th class="n">Qty</th><th class="n">W / unit</th><th class="n">Subtotal W</th><th class="n">Outlets</th><th>Mounting / location</th></tr></thead><tbody>
      ${EQ.filter(e => e.no !== 'iP').map(e => `<tr><td class="no">${e.no}</td><td>${tx(e.name)}</td><td class="n">${e.qty}</td><td class="n">${e.w ? fmt(e.w) + (e.wNote ? `<small>${esc(e.wNote)}</small>` : '') : tx(e.wText)}</td><td class="n">${e.w ? fmt(e.w * e.qty) : '—'}</td><td class="n">${outlets(e) || '—'}</td><td>${e === PC ? `At LAN drops ${Object.entries(PC_AT).map(([k, n]) => `${k} ×${n}`).join(', ')}` : tx(e.mount)}</td></tr>`).join('')}
    </tbody><tfoot><tr><td></td><td>Total</td><td></td><td></td><td class="n">${fmt(totalW)}</td><td class="n">${totalOut}</td><td>≈ ${(totalW / 230).toFixed(1)} A at 230 V</td></tr></tfoot></table>
    <ul class="notes"><li><b>Outlet positions are indicative and may be adjusted flexibly to suit site conditions.</b></li>
      <li>All outlets at floor level, one per device.</li>
      <li>A dedicated circuit is recommended for the VR360 Simulator (2,800 W ≈ 12.2 A).</li>
      <li>Laptop outlets are at the LAN drops of the PCs they serve (see plan).</li>
      <li>Power figures are catalog estimates; final values will follow once equipment is confirmed.</li></ul>${SOURCE}`},

  'lan-locations': {title: 'Wired LAN Locations', planFirst: true, table: () => `
    <table><thead><tr><th>No.</th><th>Location / devices</th><th class="n">Ports</th><th>Notes</th></tr></thead><tbody>
      ${LAN.map(l => `<tr><td class="no">${l.no}</td><td>${tx(l.name)}</td><td class="n">${l.ports}</td><td>${l.ipad ? `${l.ipad} for iPad` : ''}</td></tr>`).join('')}
    </tbody><tfoot><tr><td></td><td>Total</td><td class="n">${lanPorts}</td><td></td></tr></tfoot></table>
    <ul class="notes"><li>The ${lanPorts} ports are split from the venue lines with network switches, so fewer incoming lines are needed.</li>
      <li>Drop positions are approximate; route cables along walls or under tabletops.</li></ul>${SOURCE}`},

  // positions are on the Floor Plan, so the spec list has no plan page of its own
  'equipment-spec': {title: 'Equipment Specification List', tableOnly: true, table: () => `
    <table class="spec"><colgroup><col style="width:30px"><col style="width:20%"><col style="width:34px"><col style="width:18%"><col style="width:10%"><col style="width:10%"><col style="width:13%"><col></colgroup><thead><tr><th>No.</th><th>Equipment</th><th class="n">Qty</th><th>Size mm W×D×H</th><th class="n">Weight kg</th><th>Mounting</th><th>Space</th><th>Notes</th></tr></thead><tbody>
      ${EQ.map(e => `<tr><td class="no">${e.no}</td><td>${tx(e.name)}</td><td class="n">${e.qty}</td><td>${tx(e.size)}</td><td class="n">${tx(e.kg)}</td><td>${tx(e.mount)}</td><td>${e.space ? tx(e.space) : ''}</td><td>${e.note ? tx(e.note) : ''}</td></tr>`).join('')}
    </tbody></table>
    <ul class="notes"><li>Positions: see the Floor Plan. Power: see the Power List.</li></ul>${SOURCE}`},

  'wall-mount': {title: 'Wall-Mounted Screens', table: () => {
    const rows = EQ.filter(e => MOUNT[e.no]);
    return `<table><thead><tr><th>No.</th><th>Screen</th><th>Wall</th><th class="n">Centre height mm</th><th class="n">Top edge mm</th><th>Size mm</th><th class="n">Weight kg</th></tr></thead><tbody>
      ${rows.map(e => {const m = MOUNT[e.no], hgt = {32: 402, 43: 535, 50: 623, 65: 809, 85: 1059}[IN[e.no]];
        return `<tr><td class="no">${e.no}</td><td>${tx(e.name)}</td><td>${tx(m.wall)}</td><td class="n">${fmt(m.h * 1000)}</td><td class="n">${fmt(Math.round(m.h * 1000 + hgt / 2 + 15))}</td><td>${tx(e.size)}</td><td class="n">${tx(e.kg)}</td></tr>`;}).join('')}
    </tbody><tfoot><tr><td></td><td>Total: ${rows.length} screens</td><td></td><td></td><td></td><td></td><td class="n">${rows.reduce((s, e) => s + +(String(en(e.kg)).match(/\d+(\.\d+)?/) || [0])[0], 0)}</td></tr></tfoot></table>
    <ul class="notes"><li>Centre height: floor (carpet) to screen centre. Top edge is approximate (screen plus bezel).</li>
      <li>Walls are H3000; reinforcement (backing) is needed at each mounting position.</li>
      <li>One outlet per screen at floor level below it; the cable runs up the wall behind.</li></ul>${SOURCE}`;}},
};

fs.mkdirSync(SRC, {recursive: true});
const cont = t => `<div class="pb"></div><h2 class="cont">${t} (cont.)</h2>`;
// single document: plan page and table page in the document's own order (the floor plan is the plan alone)
const sheet = (k, d) => `<section class="sheet">${head(d.title, k)}${d.planOnly
  ? `${planPage(k, d.title, true)}${d.notes()}`
  : d.tableOnly ? d.table()
  : d.planFirst ? `${planPage(k, d.title, true)}${cont(d.title)}${d.table()}`
  : `${d.table()}${planPage(k, d.title)}`}</section>`;
const html = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title><style>${CSS}</style></head><body>${body}</body></html>`;
const jobs = Object.entries(DOCS).map(([k, d]) => [k, html(d.title, sheet(k, d))]);
jobs.push(['booth-documents-all', html('SIGGRAPH Asia 2026 FORUM8 Booth Documents', Object.entries(DOCS).map(([k, d]) => sheet(k, d)).join(''))]);
for (const [k, h] of jobs) {
  const src = path.join(SRC, k + '.html');
  fs.writeFileSync(src, h);
  // a fresh profile per print, so no running instance can take the job over; give up after 90 s
  const pdf = path.join(DIR, k + '.pdf'), before = fs.existsSync(pdf) ? fs.statSync(pdf).mtimeMs : 0;
  execFileSync(BROWSER, ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'booth-print-'))}`, '--no-pdf-header-footer', `--print-to-pdf=${pdf}`, pathToFileURL(src).href], {stdio: 'ignore', timeout: 90000});
  if (!fs.existsSync(pdf) || fs.statSync(pdf).mtimeMs <= before) throw new Error(`${k}.pdf was not written`);
  console.log(k + '.pdf', fs.statSync(pdf).size);
}
