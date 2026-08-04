/**
 * CANVAS — Leaderboard Card Generator (800x600px)
 *
 * Renders top-10 as a styled card with:
 *   - Dark background with accent header
 *   - Mini avatars for top 3 (gold/silver/bronze rings)
 *   - XP bars for each entry
 *   - Rank numbers with special styling for #1-3
 */

import axios from 'axios';

const W = 800;
const HEADER_H = 80;
const ROW_H    = 52;
const PADDING  = 16;

async function fetchBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await axios.get<ArrayBuffer>(url, { responseType: 'arraybuffer', timeout: 6000, maxRedirects: 0 });
    return Buffer.from(res.data);
  } catch { return null; }
}

const MEDAL_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'];
const RANK_LABELS  = ['🥇', '🥈', '🥉'];

export interface LeaderboardEntry {
  rank:     number;
  userId:   string;
  username: string;
  avatarUrl: string;
  level:    number;
  totalXp:  number;
  messages: number;
}

export async function createLeaderboardCard(entries: LeaderboardEntry[], guildName: string): Promise<Buffer> {
  const { createCanvas, loadImage } = await import('@napi-rs/canvas');

  const count  = Math.min(entries.length, 10);
  const H      = HEADER_H + count * ROW_H + PADDING * 2;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#1a1b1e';
  ctx.fillRect(0, 0, W, H);

  // Header
  const hGrad = ctx.createLinearGradient(0, 0, W, 0);
  hGrad.addColorStop(0, '#5865f2');
  hGrad.addColorStop(1, '#3b44c2');
  ctx.fillStyle = hGrad;
  ctx.fillRect(0, 0, W, HEADER_H);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText('🏆  Leaderboard', 24, 50);

  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '18px sans-serif';
  ctx.fillText(guildName, W - ctx.measureText(guildName).width - 24, 50);

  // Max XP for scaling bars
  const maxXp = entries[0]?.totalXp ?? 1;

  for (let i = 0; i < count; i++) {
    const e  = entries[i];
    const y  = HEADER_H + PADDING + i * ROW_H;
    const isTop3 = i < 3;

    // Row background (alternating)
    ctx.fillStyle = i % 2 === 0 ? '#25262b' : '#1e1f22';
    ctx.fillRect(0, y, W, ROW_H);

    // Left accent bar for top 3
    if (isTop3) {
      ctx.fillStyle = MEDAL_COLORS[i];
      ctx.fillRect(0, y, 4, ROW_H);
    }

    // Rank number / medal
    ctx.font = 'bold 20px sans-serif';
    ctx.fillStyle = isTop3 ? MEDAL_COLORS[i] : '#72767d';
    const rankStr = isTop3 ? RANK_LABELS[i] : `#${e.rank}`;
    ctx.fillText(rankStr, 14, y + 32);

    // Mini avatar
    const avatarX = 58, avatarY = y + ROW_H / 2, avatarR = 18;
    const avatarBuf = await fetchBuffer(e.avatarUrl);
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarR, 0, Math.PI * 2);
    ctx.clip();
    if (avatarBuf) {
      try {
        ctx.drawImage(await loadImage(avatarBuf), avatarX - avatarR, avatarY - avatarR, avatarR * 2, avatarR * 2);
      } catch {
        ctx.fillStyle = '#36393f'; ctx.fillRect(avatarX - avatarR, avatarY - avatarR, avatarR * 2, avatarR * 2);
      }
    } else {
      ctx.fillStyle = '#36393f'; ctx.fillRect(avatarX - avatarR, avatarY - avatarR, avatarR * 2, avatarR * 2);
    }
    ctx.restore();

    // Avatar ring for top 3
    if (isTop3) {
      ctx.strokeStyle = MEDAL_COLORS[i];
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(avatarX, avatarY, avatarR + 2, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Username
    ctx.fillStyle = '#ffffff';
    ctx.font = `${isTop3 ? 'bold' : ''} 18px sans-serif`.trim();
    ctx.fillText(e.username.slice(0, 18), 88, y + 22);

    // Level + XP
    ctx.fillStyle = '#b9bbbe';
    ctx.font = '13px sans-serif';
    ctx.fillText(`Lv. ${e.level}  •  ${e.totalXp.toLocaleString()} XP`, 88, y + 40);

    // Mini XP bar (right side)
    const barX = 420, barY2 = y + 18, barW = 340, barH2 = 10;
    ctx.fillStyle = '#3f4147';
    ctx.beginPath();
    ctx.roundRect(barX, barY2, barW, barH2, 5);
    ctx.fill();

    const fillW = barW * (e.totalXp / maxXp);
    if (fillW > 0) {
      const barGrad = ctx.createLinearGradient(barX, 0, barX + fillW, 0);
      barGrad.addColorStop(0, isTop3 ? MEDAL_COLORS[i] : '#5865f2');
      barGrad.addColorStop(1, isTop3 ? `${MEDAL_COLORS[i]}88` : '#7289da88');
      ctx.fillStyle = barGrad;
      ctx.beginPath();
      ctx.roundRect(barX, barY2, Math.max(10, fillW), barH2, 5);
      ctx.fill();
    }

    // Messages label
    ctx.fillStyle = '#72767d';
    ctx.font = '12px sans-serif';
    ctx.fillText(`${e.messages.toLocaleString()} msg`, barX, y + 44);
  }

  // Bottom border
  ctx.fillStyle = '#5865f220';
  ctx.fillRect(0, H - 2, W, 2);

  return canvas.toBuffer('image/png');
}
