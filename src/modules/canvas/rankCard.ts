/**
 * CANVAS — Rank Card Generator (1000x300px)
 *
 * Renders: avatar with dominant-color accent ring, username, level badge,
 * rank badge, XP gradient progress bar, total XP + message count.
 *
 * Only uses @napi-rs/canvas (already in package.json) + axios.
 */

import axios from 'axios';

const W = 1000;
const H = 300;

async function fetchBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await axios.get<ArrayBuffer>(url, { responseType: 'arraybuffer', timeout: 8000, maxRedirects: 0 });
    return Buffer.from(res.data);
  } catch { return null; }
}

async function getDominantColor(buf: Buffer): Promise<string> {
  try {
    const { createCanvas, loadImage } = await import('@napi-rs/canvas');
    const img = await loadImage(buf);
    const c = createCanvas(16, 16);
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, 16, 16);
    const data = ctx.getImageData(0, 0, 16, 16).data;
    let r = 0, g = 0, b = 0, count = 0;
    for (let i = 0; i < data.length; i += 4) {
      const brightness = (data[i] + data[i+1] + data[i+2]) / 3;
      if (brightness < 30 || brightness > 225) continue;
      r += data[i]; g += data[i+1]; b += data[i+2]; count++;
    }
    if (count === 0) return '#5865f2';
    return `#${Math.round(r/count).toString(16).padStart(2,'0')}${Math.round(g/count).toString(16).padStart(2,'0')}${Math.round(b/count).toString(16).padStart(2,'0')}`;
  } catch { return '#5865f2'; }
}

type CanvasCtx = ReturnType<ReturnType<Awaited<typeof import('@napi-rs/canvas')>['createCanvas']>['getContext']>;

function roundRect(ctx: CanvasCtx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export interface RankCardOptions {
  avatarUrl: string;
  username:  string;
  level:     number;
  rank:      number;
  currentXp: number;
  neededXp:  number;
  totalXp:   number;
  messages:  number;
}

export async function createRankCard(opts: RankCardOptions): Promise<Buffer> {
  const { createCanvas, loadImage } = await import('@napi-rs/canvas');

  const avatarBuf = await fetchBuffer(opts.avatarUrl);
  const accent    = avatarBuf ? await getDominantColor(avatarBuf) : '#5865f2';

  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // Background
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, '#1a1b1e');
  bgGrad.addColorStop(1, '#2b2d31');
  ctx.fillStyle = bgGrad;
  roundRect(ctx, 0, 0, W, H, 20);
  ctx.fill();

  // Accent glow
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 300);
  glow.addColorStop(0, `${accent}22`); glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  roundRect(ctx, 0, 0, W, H, 20); ctx.fill();

  // Avatar ring glow
  const cx = 150, cy = H / 2, r = 100;
  const ringGrad = ctx.createRadialGradient(cx, cy, r - 4, cx, cy, r + 8);
  ringGrad.addColorStop(0, accent); ringGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = ringGrad;
  ctx.beginPath(); ctx.arc(cx, cy, r + 8, 0, Math.PI * 2); ctx.fill();

  // Avatar
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
  if (avatarBuf) {
    try { ctx.drawImage(await loadImage(avatarBuf), cx - r, cy - r, r * 2, r * 2); }
    catch { ctx.fillStyle = '#36393f'; ctx.fillRect(cx - r, cy - r, r * 2, r * 2); }
  } else {
    ctx.fillStyle = '#36393f'; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  ctx.restore();

  const textX = 290;

  // Username
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 42px sans-serif';
  ctx.fillText(opts.username.slice(0, 20), textX, 90);

  // Rank badge (top right)
  const rankLabel = `RANK #${opts.rank}`;
  ctx.font = 'bold 22px sans-serif';
  const rankW = ctx.measureText(rankLabel).width + 24;
  roundRect(ctx, W - rankW - 30, 24, rankW, 36, 8);
  ctx.fillStyle = accent; ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.fillText(rankLabel, W - rankW - 18, 48);

  // Level badge
  const lvlLabel = `LEVEL ${opts.level}`;
  ctx.font = 'bold 22px sans-serif';
  const lvlW = ctx.measureText(lvlLabel).width + 24;
  roundRect(ctx, textX, 104, lvlW, 34, 8);
  ctx.fillStyle = `${accent}55`; ctx.fill();
  ctx.fillStyle = accent; ctx.fillText(lvlLabel, textX + 12, 126);

  // XP text
  ctx.fillStyle = '#b9bbbe'; ctx.font = '20px sans-serif';
  ctx.fillText(`${opts.currentXp.toLocaleString()} / ${opts.neededXp.toLocaleString()} XP`, textX, 170);

  // Progress bar
  const barX = textX, barY = 190, barW = W - textX - 40, barH = 28;
  const pct = Math.min(opts.currentXp / opts.neededXp, 1);

  roundRect(ctx, barX, barY, barW, barH, barH / 2);
  ctx.fillStyle = '#3f4147'; ctx.fill();

  if (pct > 0) {
    const fillW = Math.max(barH, barW * pct);
    const barGrad = ctx.createLinearGradient(barX, 0, barX + fillW, 0);
    barGrad.addColorStop(0, accent); barGrad.addColorStop(1, '#ffffff44');
    roundRect(ctx, barX, barY, fillW, barH, barH / 2);
    ctx.fillStyle = barGrad; ctx.fill();

    // Shine
    const shine = ctx.createLinearGradient(barX, barY, barX, barY + barH);
    shine.addColorStop(0, 'rgba(255,255,255,0.15)'); shine.addColorStop(0.5, 'transparent');
    roundRect(ctx, barX, barY, fillW, barH, barH / 2);
    ctx.fillStyle = shine; ctx.fill();

    ctx.font = 'bold 14px sans-serif';
    ctx.fillStyle = pct > 0.15 ? '#ffffff' : '#b9bbbe';
    ctx.fillText(`${Math.round(pct * 100)}%`, barX + fillW - 42, barY + 19);
  }

  // Stats row
  const statsY = 252;
  const stats = [
    { label: 'TOTAL XP',  value: opts.totalXp.toLocaleString()  },
    { label: 'MESSAGES',  value: opts.messages.toLocaleString()  },
  ];
  stats.forEach((s, i) => {
    const sx = textX + i * 210;
    ctx.fillStyle = '#b9bbbe'; ctx.font = '14px sans-serif'; ctx.fillText(s.label, sx, statsY);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 22px sans-serif'; ctx.fillText(s.value, sx, statsY + 26);
  });

  return canvas.toBuffer('image/png');
}
