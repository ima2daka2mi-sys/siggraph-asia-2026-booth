// 帳票PDF（英語）の生成：index.html の EQ / LAN と造作の座標から帳票HTMLを作り、Edge のヘッドレス印刷でPDF化する
//   node docs/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(DIR, 'src');
const EDGE = process.env.EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ISSUED = process.env.ISSUED || new Date().toISOString().slice(0, 10);
const page = fs.readFileSync(path.join(DIR, '..', 'index.html'), 'utf8');

// ---- plan geometry (mm, same as index.html: x → side B, y → front A) ----
function bandPts(p1, p2, th, off = 0) {
  const [x1, y1] = p1, [x2, y2] = p2, L = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / L, uy = (y2 - y1) / L, nx = uy, ny = -ux, o1 = off - th / 2, o2 = off + th / 2;
  return {pts: [[x1 + nx * o1, y1 + ny * o1], [x2 + nx * o1, y2 + ny * o1], [x2 + nx * o2, y2 + ny * o2], [x1 + nx * o2, y1 + ny * o2]], n: [nx, ny]};
}
const fA = [180, 170], fB = [1750, 1600], fS = [452, 418];
const fw = bandPts(fA, fB, 370);
const fMid = [(fS[0] + fB[0]) / 2 + fw.n[0] * 250, (fS[1] + fB[1]) / 2 + fw.n[1] * 250];
const sMid = [2565 + Math.SQRT1_2 * 50, 3365 - Math.SQRT1_2 * 50];

function grab(name) {
  const i = page.indexOf(`const ${name}=[`);
  if (i < 0) throw new Error(`${name} not found in index.html`);
  let d = 0, j = page.indexOf('[', i);
  for (let k = j; k < page.length; k++) { if (page[k] === '[') d++; else if (page[k] === ']' && --d === 0) return vm.runInNewContext(page.slice(j, k + 1), {fMid, sMid, fw, Math}); }
}
const EQ = grab('EQ'), LAN = grab('LAN');

// wall-mounted screens: centre height (m) and the wall they hang on, from the tv() calls in index.html
const MOUNT = {
  2: {h: 1.8, wall: ['ForumSync壁（VR360側）', 'ForumSync wall, VR360 side']},
  5: {h: 1.62, wall: ['F8VPS壁（展示台側）', 'F8VPS wall, stand side']},
  6: {h: 1.5, wall: ['F8VPS壁（ホログラム側）', 'F8VPS wall, hologram side']},
  7: {h: 1.62, wall: ['ForumSync壁（展示台側）', 'ForumSync wall, stand side']},
  8: {h: 1.5, wall: ['STOCK 左面（C側）', 'STOCK, left face (side C)']},
  9: {h: 1.45, wall: ['ForumSync壁 B側面', 'ForumSync wall, side-B face']},
  11: {h: 1.8, wall: ['STOCK 前面（A側）', 'STOCK, front face (side A)']},
};
const IN = {2: 43, 5: 50, 6: 65, 7: 50, 8: 32, 9: 85, 11: 43};

const en = v => Array.isArray(v) ? v[1] : v;
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const tx = v => esc(en(v)); // documents are English only
const fmt = n => n.toLocaleString('en-US');
const outlets = e => e.w ? e.qty : 0;
const totalW = EQ.reduce((s, e) => s + e.w * e.qty, 0), totalOut = EQ.reduce((s, e) => s + outlets(e), 0);
const lanPorts = LAN.reduce((s, l) => s + l.ports, 0);

// ---- plan drawing (SVG, 1 unit = 1 mm) ----
const P = pts => pts.map(p => p.map(v => v.toFixed(0)).join(',')).join(' ');
const rect = (x1, y1, x2, y2, cls) => `<rect class="${cls}" x="${x1}" y="${y1}" width="${x2 - x1}" height="${y2 - y1}"/>`;
function plan({eq = true, lan = true, focus = '', h = '120mm'} = {}) {
  const s = [];
  s.push(rect(0, 0, 6000, 6000, 'carpet'));
  // floor areas and furniture
  s.push(rect(100, 4160, 2600, 5560, 'area'), `<text class="area-t" x="1350" y="5535">VR360 2500×1400</text>`);
  s.push(`<polygon class="stand" points="${P(bandPts(fS, fB, 380, 375).pts)}"/>`, `<polygon class="stand" points="${P(bandPts([1950, 2750], [3180, 3980], 330, 175).pts)}"/>`);
  [4100, 5350].forEach(x => s.push(rect(x, 3925, x + 600, 5725, 'table')));
  [[4050, 2250], [3580, 5550]].forEach(([x, y]) => s.push(`<circle class="table" cx="${x}" cy="${y}" r="300"/>`));
  s.push(`<circle class="table" cx="420" cy="1780" r="250"/>`);
  s.push(rect(5000 - 400, 2250 - 400, 5000 + 400, 2250 + 400, 'unit'));                 // motion seat 800×800
  s.push(rect(1350 - 1023, 4860 - 625, 1350 + 1023, 4860 + 625, 'unit'));               // VR360 pod 2047×1250
  [3690, 5800].forEach(y => s.push(`<line class="pole" x1="450" y1="${y}" x2="1450" y2="${y}"/>`, `<circle class="post" cx="450" cy="${y}" r="45"/><circle class="post" cx="1450" cy="${y}" r="45"/>`));
  // walls H2700
  [[3000, 0, 3300, 100], [4100, 0, 6000, 100], [3000, 100, 3100, 1500], [3100, 1400, 5900, 1500], [5900, 100, 6000, 1500]].forEach(r => s.push(rect(...r, 'wall')));
  s.push(`<polygon class="wall" points="${P(fw.pts)}"/>`);
  s.push(`<polygon class="wall" points="${P([[1950, 2750], [3180, 3980], [3180, 6000], [2670, 6000], [2670, 4191], [1589, 3111]])}"/>`);
  s.push(`<path class="door" d="M3300 100 L3300 900 A800 800 0 0 0 4100 100"/>`);
  // area names
  [['STOCK 3000×1500', 4500, 820], ['F8VPS', 1600, 470], ['ForumSync', 3020, 2930], ['DRIVING ×6', 5025, 3830], ['PRESENTATION', 3900, 5250]].forEach(([t, x, y]) => s.push(`<text class="name" x="${x}" y="${y}">${t}</text>`));
  s.push(`<text class="door-t" x="3700" y="1060">DOOR W800</text>`);
  // sides
  s.push(`<text class="side" x="3000" y="6420">A  FRONT (aisle)</text>`, `<text class="side" x="3000" y="-260">BACK</text>`,
    `<text class="side" transform="translate(6330 3000) rotate(90)">B  RIGHT (aisle)</text>`, `<text class="side" transform="translate(-330 3000) rotate(-90)">C  LEFT (aisle)</text>`);
  // overall dimensions
  s.push(`<g class="dim"><line x1="0" y1="6700" x2="6000" y2="6700"/><line x1="0" y1="6620" x2="0" y2="6780"/><line x1="6000" y1="6620" x2="6000" y2="6780"/><text x="3000" y="6660">6000</text>
    <line x1="6700" y1="0" x2="6700" y2="6000"/><line x1="6620" y1="0" x2="6780" y2="0"/><line x1="6620" y1="6000" x2="6780" y2="6000"/><text transform="translate(6660 3000) rotate(90)">6000</text></g>`);
  if (lan === 'dot') LAN.forEach(l => s.push(`<rect class="landot" x="${l.pos[0] - 55}" y="${l.pos[1] - 55}" width="110" height="110"/>`)); // under the pins
  if (eq) EQ.filter(e => e.pos).forEach(e => s.push(`<g class="pin${focus === 'eq' ? ' big' : ''}"><circle cx="${e.pos[0]}" cy="${e.pos[1]}" r="${focus === 'eq' ? 190 : 150}"/><text x="${e.pos[0]}" y="${e.pos[1]}">${e.no}</text></g>`));
  if (lan && lan !== 'dot') LAN.forEach(l => s.push(`<g class="lan${focus === 'lan' ? ' big' : ''}"><rect x="${l.pos[0] - 200}" y="${l.pos[1] - 120}" width="400" height="240" rx="40"/><text x="${l.pos[0]}" y="${l.pos[1]}">${l.no}</text></g>`));
  return `<svg class="plan" style="height:${h}" viewBox="-700 -600 7700 7500" xmlns="http://www.w3.org/2000/svg">${s.join('')}</svg>`;
}

// ---- documents ----
const CSS = `
@page{size:A4;margin:14mm 12mm}
@page land{size:A4 landscape;margin:12mm}
*{box-sizing:border-box}
body{margin:0;font-family:"Segoe UI",Arial,sans-serif;color:#15171b;font-size:9.5pt;line-height:1.45;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.sheet{break-after:page}.sheet:last-child{break-after:auto}
.land{page:land}
header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1f4e79;padding-bottom:6px;margin-bottom:10px}
h1{margin:0;font-size:16pt;letter-spacing:.02em}h1 small{display:block;font-size:10pt;font-weight:400;color:#555}
.meta{text-align:right;font-size:8.5pt;color:#444}.meta b{color:#15171b}
table{width:100%;border-collapse:collapse;font-size:8.8pt}
th,td{border:1px solid #b9bec6;padding:2.5px 6px;vertical-align:top;text-align:left}
th{background:#1f4e79;color:#fff;font-weight:700;font-size:8.2pt}
th small,td small{display:block;font-size:7.6pt;color:#666;font-weight:400}th small{color:#d6e2ef}
td.n,th.n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
td.c{text-align:center;white-space:nowrap}
td.no{text-align:center;font-weight:700;width:26px}
tfoot td{background:#eef3f8;font-weight:700}
.chips{display:flex;gap:10px;margin:0 0 10px}
.chip{flex:1;border:1px solid #b9bec6;border-radius:4px;padding:6px 10px}.chip b{display:block;font-size:15pt}.chip span{font-size:8pt;color:#555}
.notes{margin:10px 0 0;padding-left:16px;font-size:8.4pt;color:#333}.notes li{margin:2px 0}
.wrap{display:flex;gap:12px;align-items:flex-start}.wrap>.plan{flex:none}.wrap>div{flex:1}
.plan{width:auto;display:block;margin:0 auto}
.plan .carpet{fill:#f4f5f6;stroke:#15171b;stroke-width:24}
.plan .wall{fill:#8a8d93;stroke:#3a3d42;stroke-width:10}
.plan .stand{fill:#dfe3e8;stroke:#7b8087;stroke-width:10}
.plan .area{fill:#e5efd9;stroke:#6a9a3a;stroke-width:10;stroke-dasharray:60 40}
.plan .area-t{font-size:90px;fill:#4f7a26;text-anchor:middle}
.plan .table{fill:#efe2c7;stroke:#a8875a;stroke-width:10}
.plan .unit{fill:none;stroke:#15171b;stroke-width:14;stroke-dasharray:40 30}
.plan .pole{stroke:#c0392b;stroke-width:30}.plan .post{fill:#5e6168}
.plan .door{fill:none;stroke:#3a3d42;stroke-width:10;stroke-dasharray:30 25}
.plan .door-t{font-size:110px;text-anchor:middle;fill:#3a3d42}
.plan .name{font-size:150px;font-weight:700;text-anchor:middle;fill:#3a3d42}
.plan .side{font-size:170px;font-weight:700;text-anchor:middle;fill:#1f4e79}
.plan .dim line{stroke:#555;stroke-width:12}.plan .dim text{font-size:150px;text-anchor:middle;fill:#333}
.plan .pin circle{fill:#1f4e79;stroke:#fff;stroke-width:24}.plan .pin text{fill:#fff;font-size:170px;font-weight:700;text-anchor:middle;dominant-baseline:central}
.plan .pin.big text{font-size:210px}
.plan .lan rect{fill:#ff9f1a;stroke:#15171b;stroke-width:14}.plan .lan text{fill:#15171b;font-size:150px;font-weight:700;text-anchor:middle;dominant-baseline:central}
.plan .lan.big rect{stroke-width:20}
.plan .landot{fill:#ff9f1a;stroke:#15171b;stroke-width:12}
.legend{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:8pt;margin-top:6px;color:#333}.legend i{display:inline-block;width:14px;height:10px;margin-right:4px;vertical-align:-1px;border:1px solid #555}
table.spec{font-size:8pt;table-layout:fixed}table.spec td{padding:2px 5px}table.spec small{font-size:7pt}
footer.src{margin-top:8px;font-size:7.6pt;color:#666}
`;
const head = (ttl, no) => `<header><h1>${ttl}</h1>
  <div class="meta"><b>SIGGRAPH Asia 2026 · FORUM8 Booth</b><br>Island 6000×6000 / based on floor plan rev. 8<br>${no} / Issued ${ISSUED} / Draft</div></header>`;
const SOURCE = `<footer class="src">Source: Exhibition equipment spec list (30 Oct 2026, draft) / Booth 3D: https://ima2daka2mi-sys.github.io/siggraph-asia-2026-booth/</footer>`;
const legend = `<div class="legend"><span><i style="background:#8a8d93"></i>Wall H2700</span><span><i style="background:#dfe3e8"></i>Stand H1000</span>
  <span><i style="background:#efe2c7"></i>Table</span><span><i style="background:#e5efd9"></i>VR360 area</span><span><i style="background:#1f4e79"></i>Equipment no.</span>
  <span><i style="background:#ff9f1a"></i>Wired LAN</span><span><i style="background:#c0392b"></i>Pole partition</span></div>`;

const DOCS = {
  'floor-plan': {title: 'Floor Plan', land: true, body: () => `
    <div class="wrap">${plan({focus: 'eq', lan: 'dot', h: '158mm'})}
    <div><table><thead><tr><th>No.</th><th>Equipment</th><th class="n">Qty</th></tr></thead><tbody>
      ${EQ.filter(e => e.pos).map(e => `<tr><td class="no">${e.no}</td><td>${tx(e.name)}</td><td class="n">${e.qty}</td></tr>`).join('')}
      <tr><td class="no" style="background:#ff9f1a">L</td><td>Wired LAN: ${LAN.length} drops / ${lanPorts} ports (see Wired LAN Locations)</td><td class="n">${lanPorts}</td></tr>
    </tbody></table>
    <ul class="notes"><li>Dimensions in mm. Walls H2700, stands H1000 (tentative).</li>
      <li>Dashed outlines show floor-standing units (VR360 2047×1250, motion seat 800×800).</li></ul></div></div>${legend}`},

  'power-list': {title: 'Power List', body: () => `
    <div class="chips"><div class="chip"><b>${fmt(totalW)} W</b><span>Total power</span></div><div class="chip"><b>≈ ${(totalW / 230).toFixed(1)} A</b><span>at 230 V</span></div>
      <div class="chip"><b>${totalOut}</b><span>Outlets</span></div></div>
    <table><thead><tr><th>No.</th><th>Equipment</th><th class="n">Qty</th><th class="n">W / unit</th><th class="n">Subtotal W</th><th class="n">Outlets</th><th>Mounting / location</th></tr></thead><tbody>
      ${EQ.filter(e => e.no !== 'iP').map(e => `<tr><td class="no">${e.no}</td><td>${tx(e.name)}</td><td class="n">${e.qty}</td><td class="n">${e.w ? fmt(e.w) +(e.wNote ? `<small>${esc(e.wNote)}</small>` : '') : tx(e.wText)}</td><td class="n">${e.w ? fmt(e.w * e.qty) : '—'}</td><td class="n">${outlets(e) || '—'}</td><td>${tx(e.mount)}</td></tr>`).join('')}
    </tbody><tfoot><tr><td></td><td>Total</td><td></td><td></td><td class="n">${fmt(totalW)}</td><td class="n">${totalOut}</td><td>≈ ${(totalW / 230).toFixed(1)} A at 230 V</td></tr></tfoot></table>
    <ul class="notes"><li>Extension cords and power strips are not permitted: each location needs its own outlets (guide: one outlet per device).</li>
      <li>Power figures are catalog estimates; final values will be updated once equipment is confirmed.</li>
      <li>The VR motion seat alone draws 220 VAC 9 A; a dedicated circuit is recommended.</li>
      <li>See the Floor Plan for the position of each equipment number.</li></ul>${SOURCE}`},

  'lan-locations': {title: 'Wired LAN Locations', body: () => `
    <div class="chips"><div class="chip"><b>${LAN.length}</b><span>Drop locations</span></div><div class="chip"><b>${lanPorts}</b><span>Total ports</span></div>
      <div class="chip"><b>${LAN.reduce((s, l) => s + (l.ipad || 0), 0)}</b><span>of which for iPads</span></div></div>
    ${plan({eq: false, focus: 'lan', h: '100mm'})}
    <table style="margin-top:8px"><thead><tr><th>No.</th><th>Location / devices</th><th class="n">Ports</th><th>Notes</th></tr></thead><tbody>
      ${LAN.map(l => `<tr><td class="no">${l.no}</td><td>${tx(l.name)}</td><td class="n">${l.ports}</td><td>${l.ipad ? `${l.ipad} for iPad` : ''}</td></tr>`).join('')}
    </tbody><tfoot><tr><td></td><td>Total</td><td class="n">${lanPorts}</td><td></td></tr></tfoot></table>
    <ul class="notes"><li>Drop positions are approximate; route cables along walls or under tabletops near stands and tables.</li></ul>${SOURCE}`},

  'equipment-spec': {title: 'Equipment Specification List', land: true, body: () => `
    <table class="spec"><colgroup><col style="width:26px"><col style="width:21%"><col style="width:34px"><col style="width:12%"><col style="width:8%"><col style="width:10%"><col style="width:8%"><col style="width:8%"><col></colgroup><thead><tr><th>No.</th><th>Equipment</th><th class="n">Qty</th><th>Size mm (W×D×H)</th><th class="n">Weight kg</th><th class="n">Power W</th><th>Mounting</th><th>Space</th><th>Notes</th></tr></thead><tbody>
      ${EQ.map(e => `<tr><td class="no">${e.no}</td><td>${tx(e.name)}</td><td class="n">${e.qty}</td><td>${tx(e.size)}</td><td class="n">${tx(e.kg)}</td><td class="n">${e.w ? fmt(e.w) : e.no === 'iP' ? '—' : tx(e.wText)}</td><td>${tx(e.mount)}</td><td>${e.space ? tx(e.space) : ''}</td><td>${e.note ? tx(e.note) : ''}</td></tr>`).join('')}
    </tbody></table>${SOURCE}`},

  'wall-mount': {title: 'Wall-Mounted Screens', body: () => {
    const rows = EQ.filter(e => MOUNT[e.no]);
    return `<table><thead><tr><th>No.</th><th>Screen</th><th>Wall</th><th class="n">Centre height mm</th><th class="n">Top edge mm</th><th>Size mm</th><th class="n">Weight kg</th><th class="n">Power W</th></tr></thead><tbody>
      ${rows.map(e => {const m = MOUNT[e.no], hgt = {32: 402, 43: 535, 50: 623, 65: 809, 85: 1059}[IN[e.no]];
        return `<tr><td class="no">${e.no}</td><td>${tx(e.name)}</td><td>${tx(m.wall)}</td><td class="n">${fmt(m.h * 1000)}</td><td class="n">${fmt(Math.round(m.h * 1000 + hgt / 2 + 15))}</td><td>${tx(e.size)}</td><td class="n">${tx(e.kg)}</td><td class="n">${fmt(e.w)}</td></tr>`;}).join('')}
    </tbody><tfoot><tr><td></td><td>Total: ${rows.length} screens</td><td></td><td></td><td></td><td></td><td class="n">${rows.reduce((s, e) => s + +(String(en(e.kg)).match(/\d+(\.\d+)?/) || [0])[0], 0)}</td><td class="n">${fmt(rows.reduce((s, e) => s + e.w, 0))}</td></tr></tfoot></table>
    <ul class="notes"><li>Centre height is measured from the floor (carpet) to the screen centre; the top edge is approximate (screen height plus bezel).</li>
      <li>Walls are H2700; reinforcement (backing) is needed at each mounting position.</li>
      <li>One power outlet behind each screen.</li></ul>
    ${plan({lan: false, focus: 'eq', h: '92mm'})}${SOURCE}`;}},
};

fs.mkdirSync(SRC, {recursive: true});
const sheet = (k, d) => `<section class="sheet${d.land ? ' land' : ''}">${head(d.title, k)}${d.body()}</section>`;
const html = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title><style>${CSS}</style></head><body>${body}</body></html>`;
const jobs = Object.entries(DOCS).map(([k, d]) => [k, html(d.title, sheet(k, d))]);
jobs.push(['booth-documents-all', html('SIGGRAPH Asia 2026 FORUM8 Booth Documents', Object.entries(DOCS).map(([k, d]) => sheet(k, d)).join(''))]);
for (const [k, h] of jobs) {
  const src = path.join(SRC, k + '.html');
  fs.writeFileSync(src, h);
  execFileSync(EDGE, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${path.join(DIR, k + '.pdf')}`, pathToFileURL(src).href], {stdio: 'ignore'});
  console.log(k + '.pdf', fs.statSync(path.join(DIR, k + '.pdf')).size);
}
