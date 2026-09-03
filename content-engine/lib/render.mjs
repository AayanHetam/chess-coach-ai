/**
 * Deterministic frame renderer. Chromium draws, nothing generative runs.
 *
 * Hard format rules, all paid for in watch time:
 *   - The board is on screen at frame zero. There is no intro card, ever.
 *   - Goal, ELO and the difficulty badge are on the first frame.
 *   - Countdown is 5 ticks at 1.6s each, and the answer never appears.
 */
import fs from "node:fs";
import path from "node:path";
import { Chess } from "chess.js";
import { linkBand } from "./puzzles.mjs";

export const FPS = 30;
const T_STATIC = 1.0; // board at the raw FEN
const T_MOVE = 1.4; // opponent's setup move lands, then its SAN holds
const T_SLIDE = 0.5; // the piece itself is only in motion this long
const TICKS = 5;
const TICK = 1.6;
const T_END = 1.6;
export const DURATION = T_STATIC + T_MOVE + TICKS * TICK + T_END; // 12.0s
export const FRAMES = Math.round(DURATION * FPS);

const W = 1080;
const H = 1920;

// cburnett — GPLv2+, Colin M.L. Burnett. Never a sadsnake1 set (CC BY-NC-SA).
const PIECE_DIR = path.resolve(process.cwd(), "../public/piece/cburnett");
export const PIECE_CREDIT = "cburnett pieces by Colin M.L. Burnett (GPLv2+)";

function pieceDataUris() {
  const map = {};
  for (const c of ["w", "b"]) {
    for (const p of ["K", "Q", "R", "B", "N", "P"]) {
      const file = path.join(PIECE_DIR, `${c}${p}.svg`);
      const b64 = fs.readFileSync(file).toString("base64");
      // setContent has no base URL, so a relative src fails silently.
      // Every image is inlined.
      map[`${c}${p.toLowerCase()}`] = `data:image/svg+xml;base64,${b64}`;
    }
  }
  return map;
}

function boardSquares(fen) {
  const chess = new Chess(fen);
  const out = [];
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const sq = board[r][f];
      if (!sq) continue;
      out.push({
        square: sq.square,
        key: `${sq.color}${sq.type}`,
        file: f,
        rank: r, // 0 = rank 8
      });
    }
  }
  return out;
}

export function buildHtml(puzzle) {
  const pieces = pieceDataUris();
  const flip = puzzle.solverColor === "b";
  const before = boardSquares(puzzle.fen);
  const after = boardSquares(puzzle.puzzleFen);
  const band = linkBand(puzzle.rating);
  const toMove = puzzle.solverColor === "w" ? "WHITE TO PLAY" : "BLACK TO PLAY";

  const data = {
    pieces,
    flip,
    before,
    after,
    from: puzzle.setupFrom,
    to: puzzle.setupTo,
    setupSan: puzzle.setupSan,
    goal: puzzle.goal.goal(puzzle),
    sub: puzzle.goal.sub,
    rating: puzzle.rating,
    tierLabel: puzzle.tier.label,
    color: puzzle.tier.color,
    toMove,
    band,
    nbPlays: puzzle.nbPlays,
    timing: { T_STATIC, T_MOVE, T_SLIDE, TICKS, TICK, T_END },
  };

  return `<!doctype html><html><head><meta charset="utf-8"><style>
  /* Fonts are pinned to locally present faces. Google Fonts is blocked from
     the sandbox, so a render must never depend on egress. */
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:${W}px; height:${H}px; overflow:hidden;
    background:#0D1420; color:#F8FAFC;
    font-family:"Liberation Sans","DejaVu Sans","FreeSans",sans-serif;
    -webkit-font-smoothing:antialiased; }
  #stage { position:relative; width:${W}px; height:${H}px; }

  .head { position:absolute; top:74px; left:64px; right:64px; }
  .chips { display:flex; gap:14px; align-items:center; margin-bottom:26px; }
  .chip { font-size:30px; font-weight:700; letter-spacing:3px;
    padding:12px 22px; border-radius:999px; }
  .badge { background:var(--c); color:#0D1420; }
  .elo { background:rgba(248,250,252,.10); color:#CBD5E1; }
  .goal { font-size:88px; font-weight:800; letter-spacing:-1px; line-height:1;
    color:#F8FAFC; }
  .sub { margin-top:16px; font-size:36px; font-weight:500; color:#94A3B8; }

  #board { position:absolute; left:80px; top:436px; width:920px; height:920px;
    border-radius:20px; overflow:hidden; box-shadow:0 30px 80px rgba(0,0,0,.55); }
  .sq { position:absolute; width:115px; height:115px; }
  .lt { background:#F2E7DA; } .dk { background:#C2673B; }
  .hl { position:absolute; width:115px; height:115px; background:#F97316;
    opacity:0; }
  .pc { position:absolute; width:115px; height:115px; }

  #turn { position:absolute; left:80px; top:1390px; width:920px;
    text-align:center; font-size:34px; font-weight:700; letter-spacing:6px;
    color:#94A3B8; }

  #played { position:absolute; left:80px; top:1478px; width:920px;
    text-align:center; font-size:96px; font-weight:800; color:var(--c);
    letter-spacing:-1px; }

  #timer { position:absolute; left:0; top:1470px; width:${W}px;
    display:flex; justify-content:center; }
  .ring { position:relative; width:210px; height:210px; }
  .ring svg { position:absolute; inset:0; }
  .num { position:absolute; inset:0; display:flex; align-items:center;
    justify-content:center; font-size:110px; font-weight:800; color:var(--c); }

  #end { position:absolute; inset:0; background:rgba(13,20,32,.90);
    opacity:0; display:flex; flex-direction:column; align-items:center;
    justify-content:center; gap:34px; }
  #end .l1 { font-size:64px; font-weight:800; letter-spacing:-1px; }
  #end .l2 { font-size:38px; color:#94A3B8; font-weight:500; }
  #end .band { margin-top:20px; font-size:40px; font-weight:700;
    color:#0D1420; background:var(--c); padding:22px 44px; border-radius:18px; }

  #foot { position:absolute; left:64px; right:64px; bottom:70px;
    display:flex; justify-content:space-between; align-items:center;
    font-size:28px; color:#64748B; font-weight:600; letter-spacing:2px; }
  .brand { color:#F97316; font-weight:800; }
  </style></head><body><div id="stage">
    <div class="head">
      <div class="chips">
        <div class="chip badge" id="badge"></div>
        <div class="chip elo" id="elo"></div>
      </div>
      <div class="goal" id="goal"></div>
      <div class="sub" id="sub"></div>
    </div>
    <div id="board"></div>
    <div id="turn"></div>
    <div id="played"></div>
    <div id="timer"><div class="ring">
      <svg viewBox="0 0 210 210">
        <circle cx="105" cy="105" r="92" fill="none" stroke="rgba(248,250,252,.10)" stroke-width="14"/>
        <circle id="arc" cx="105" cy="105" r="92" fill="none" stroke="var(--c)"
          stroke-width="14" stroke-linecap="round"
          transform="rotate(-90 105 105)"/>
      </svg>
      <div class="num" id="num"></div>
    </div></div>
    <div id="end">
      <div class="l1">ANSWER IN THE CAPTION</div>
      <div class="l2">No scrolling required. It is right there.</div>
      <div class="band" id="bandtxt"></div>
    </div>
    <div id="foot">
      <div class="brand">CHESSMASTI.COM</div>
      <div id="plays"></div>
    </div>
  </div>
  <script>
  const D = ${JSON.stringify(data)};
  const S = 115, C = 2 * Math.PI * 92;
  document.documentElement.style.setProperty('--c', D.color);
  document.getElementById('badge').textContent = D.tierLabel;
  document.getElementById('elo').textContent = 'ELO ' + D.rating;
  document.getElementById('goal').textContent = D.goal;
  document.getElementById('sub').textContent = D.sub;
  document.getElementById('bandtxt').textContent = '/puzzles/' + D.band;
  // NbPlays is plays, not solves, and not people.
  document.getElementById('plays').textContent =
    'PLAYED ' + D.nbPlays.toLocaleString('en-US') + 'x ON LICHESS';

  const board = document.getElementById('board');
  const xy = (file, rank) => D.flip
    ? { x: (7 - file) * S, y: (7 - rank) * S }
    : { x: file * S, y: rank * S };

  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const d = document.createElement('div');
    d.className = 'sq ' + ((r + f) % 2 === 0 ? 'lt' : 'dk');
    const p = xy(f, r); d.style.left = p.x + 'px'; d.style.top = p.y + 'px';
    board.appendChild(d);
  }
  const sqPos = (name) => {
    const f = name.charCodeAt(0) - 97, r = 8 - Number(name[1]);
    return xy(f, r);
  };
  const hlFrom = document.createElement('div');
  const hlTo = document.createElement('div');
  for (const [el, sq] of [[hlFrom, D.from], [hlTo, D.to]]) {
    el.className = 'hl';
    const p = sqPos(sq); el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
    board.appendChild(el);
  }

  // Two piece layers: the position before the setup move, and after it.
  const layer = document.createElement('div');
  layer.style.position = 'absolute'; layer.style.inset = '0';
  board.appendChild(layer);
  const imgs = new Map();
  const mk = (key) => {
    const i = document.createElement('img');
    i.className = 'pc'; i.src = D.pieces[key]; layer.appendChild(i); return i;
  };
  const beforeMap = new Map(D.before.map(p => [p.square, p]));
  const afterMap = new Map(D.after.map(p => [p.square, p]));
  const allSquares = new Set([...beforeMap.keys(), ...afterMap.keys()]);
  for (const sq of allSquares) {
    const p = beforeMap.get(sq) || afterMap.get(sq);
    imgs.set(sq, mk(p.key));
  }

  const arc = document.getElementById('arc');
  arc.setAttribute('stroke-dasharray', C);
  const t = D.timing;
  const T1 = t.T_STATIC, T2 = T1 + t.T_MOVE, T3 = T2 + t.TICKS * t.TICK;

  window.renderFrame = (time) => {
    // ---- pieces -------------------------------------------------------
    const moving = time >= T1;
    const prog = time < T1 ? 0
      : time >= T2 ? 1
      : (() => {
          const u = Math.min(1, (time - T1) / t.T_SLIDE);
          return 1 - Math.pow(1 - u, 3);
        })();

    for (const [sq, img] of imgs) {
      const b = beforeMap.get(sq), a = afterMap.get(sq);
      let show = null, pos = null;
      if (sq === D.from) {
        // The mover: slides from -> to, then lives on the destination.
        show = prog < 1 ? b : null;
        if (show) {
          const p0 = sqPos(D.from), p1 = sqPos(D.to);
          pos = { x: p0.x + (p1.x - p0.x) * prog, y: p0.y + (p1.y - p0.y) * prog };
        }
      } else if (sq === D.to) {
        // Destination: captured piece fades, mover takes over at prog 1.
        if (prog < 1 && b) { show = b; pos = sqPos(sq); }
        else if (prog >= 1 && a) { show = a; pos = sqPos(sq); }
      } else {
        show = prog < 1 ? b : a;
        if (show) pos = sqPos(sq);
      }
      if (show && pos) {
        img.style.display = 'block';
        img.src = D.pieces[show.key];
        img.style.left = pos.x + 'px';
        img.style.top = pos.y + 'px';
        img.style.opacity = (sq === D.to && prog < 1 && b && a) ? String(1 - prog) : '1';
      } else {
        img.style.display = 'none';
      }
    }
    // The mover is drawn on top of whatever it lands on.
    if (prog < 1 && imgs.has(D.from)) layer.appendChild(imgs.get(D.from));

    const hlOn = time >= T1 ? Math.min(1, (time - T1) / 0.25) * 0.35 : 0;
    hlFrom.style.opacity = hlOn; hlTo.style.opacity = hlOn;

    // ---- countdown ----------------------------------------------------
    const inCount = time >= T2 && time < T3;
    const num = document.getElementById('num');
    if (inCount) {
      const elapsed = time - T2;
      const total = t.TICKS * t.TICK;
      // 5 ticks at 1.6s: the number is the tick, not the seconds remaining.
      num.textContent = String(t.TICKS - Math.floor(elapsed / t.TICK));
      arc.setAttribute('stroke-dashoffset', String(C * (elapsed / total)));
      document.getElementById('timer').style.opacity = '1';
      document.getElementById('played').style.opacity = '0';
    } else {
      document.getElementById('timer').style.opacity = '0';
      document.getElementById('played').style.opacity = time < T2 ? '1' : '0';
    }

    // Under the board: what the opponent just did, then whose move it is.
    const turn = document.getElementById('turn');
    turn.textContent = time >= T2 ? D.toMove : 'THEY JUST PLAYED';
    turn.style.opacity = '1';
    // The setup move in SAN, revealed as the piece lands.
    document.getElementById('played').textContent = prog >= 1 ? D.setupSan : '';

    // ---- end card ------------------------------------------------------
    const end = document.getElementById('end');
    end.style.opacity = time >= T3 ? String(Math.min(1, (time - T3) / 0.3)) : '0';
  };
  window.renderFrame(0);
  </script></body></html>`;
}

export const STAGE = { W, H };
