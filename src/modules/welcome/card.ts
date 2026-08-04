/**
 * WELCOME — Canvas card generator.
 *
 * Layout (1100×360):
 *   • Background layer  — custom URL or dark gradient
 *   • Card image layer  — optional banner image (like Welcomer bot), rendered
 *                         in the right half of the card with rounded corners
 *   • Vignette overlay
 *   • Accent bar (left edge)
 *   • Avatar circle     — left side
 *   • Text block        — center
 */

import { GuildMember } from 'discord.js';
import axios from 'axios';
import { tGuild } from '../../i18n';

const W = 1100;
const H = 360;

async function fetchImage(url: string): Promise<Buffer | null> {
  try {
    const res = await axios.get<ArrayBuffer>(url, { responseType: 'arraybuffer', timeout: 8000, maxRedirects: 0 });
    return Buffer.from(res.data);
  } catch {
    return null;
  }
}

/** Draw a rounded rectangle path (helper) */
function roundedRect(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  x: number, y: number, w: number, h: number, r: number,
) {
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

export async function createWelcomeCard(
  member: GuildMember,
  backgroundUrl: string | null,
  cardImageUrl: string | null = null,
  avatarBgEnabled = false,
): Promise<Buffer> {
  const { createCanvas, loadImage } = await import('@napi-rs/canvas');
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // Pre-load avatar (may be used as background)
  const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 512 });
  const avatarBuf = await fetchImage(avatarUrl);

  // ── Background ──────────────────────────────────────────────────────────────
  let drewBg = false;

  // Option 1: Avatar als Hintergrund
  if (avatarBgEnabled && avatarBuf) {
    try {
      const img = await loadImage(avatarBuf);
      // Simulate a blur effect: avatar enlarged + heavily darkened
      const scale = Math.max(W / img.width, H / img.height) * 1.1;
      const sw = img.width * scale, sh = img.height * scale;
      ctx.drawImage(img, (W - sw) / 2, (H - sh) / 2, sw, sh);
      drewBg = true;
    } catch { /* fall through */ }
  }

  // Option 2: Custom Background URL
  if (!drewBg && backgroundUrl) {
    const buf = await fetchImage(backgroundUrl);
    if (buf) {
      try {
        const img = await loadImage(buf);
        ctx.drawImage(img, 0, 0, W, H);
        drewBg = true;
      } catch { /* fall through */ }
    }
  }

  // Option 3: Gradient-Fallback
  if (!drewBg) {
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#1e1f24');
    grad.addColorStop(1, '#2f3136');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  // ── Dark vignette ───────────────────────────────────────────────────────────
  // Stronger overlay when avatar is used as background → keeps text readable
  ctx.fillStyle = avatarBgEnabled ? 'rgba(0,0,0,0.60)' : 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, W, H);

  // ── Custom card image (right panel, like Welcomer bot) ──────────────────────
  if (cardImageUrl) {
    const buf = await fetchImage(cardImageUrl);
    if (buf) {
      try {
        const img = await loadImage(buf);
        const imgX = 620, imgY = 20, imgW = 460, imgH = 320, imgR = 16;
        ctx.save();
        roundedRect(ctx, imgX, imgY, imgW, imgH, imgR);
        ctx.clip();
        // Cover-fit: scale so image fills the box
        const scale = Math.max(imgW / img.width, imgH / img.height);
        const sw = img.width * scale, sh = img.height * scale;
        ctx.drawImage(img, imgX + (imgW - sw) / 2, imgY + (imgH - sh) / 2, sw, sh);
        ctx.restore();
        // Subtle border
        ctx.save();
        roundedRect(ctx, imgX, imgY, imgW, imgH, imgR);
        ctx.strokeStyle = 'rgba(88,101,242,0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      } catch { /* skip on error */ }
    }
  }

  // ── Accent bar ──────────────────────────────────────────────────────────────
  ctx.fillStyle = '#5865f2';
  ctx.fillRect(0, 0, 8, H);

  // ── Avatar ──────────────────────────────────────────────────────────────────
  if (avatarBuf) {
    try {
      const av = await loadImage(avatarBuf);
      const cx = 180, cy = H / 2, r = 110;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(av, cx - r, cy - r, r * 2, r * 2);
      ctx.restore();

      // Glow + ring
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#5865f2';
      ctx.strokeStyle = '#5865f2';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    } catch { /* skip */ }
  }

  // ── Text block ──────────────────────────────────────────────────────────────
  // Format: "WELCOME" headline + username + member count. "to {server}" removed.
  const textX = 340;
  const guildId = member.guild.id;
  const headline = tGuild(guildId, 'welcome.card.welcome_text');
  const memberLn = tGuild(guildId, 'welcome.card.member_text', { count: member.guild.memberCount });

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 56px sans-serif';
  ctx.fillText(headline, textX, 155);

  ctx.fillStyle = '#5865f2';
  ctx.font = 'bold 44px sans-serif';
  ctx.fillText(member.user.username.slice(0, 22), textX, 225);

  ctx.fillStyle = '#b9bbbe';
  ctx.font = '22px sans-serif';
  ctx.fillText(memberLn, textX, 275);

  return canvas.toBuffer('image/png');
}
