/**
 * TICKETS — transcript generator.
 *
 * Pulls all messages from the actual Discord channel (more accurate than the
 * ticket_messages mirror, which only catches new messages while the bot is up)
 * and renders an HTML or TXT transcript.
 */

import { TextChannel, Collection, Message } from 'discord.js';
import { TicketRecord } from './repository';

const HTML_HEAD = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>Transcript</title>
<style>
  body{background:#36393f;color:#dcddde;font-family:'Segoe UI',Helvetica,Arial,sans-serif;margin:0;padding:24px;line-height:1.4;}
  .meta{background:#2f3136;padding:16px;border-radius:8px;margin-bottom:24px;border-left:4px solid #5865f2;}
  .meta h1{margin:0 0 8px;color:#fff;font-size:20px;}
  .meta div{font-size:14px;color:#b9bbbe;margin:2px 0;}
  .msg{padding:8px 12px;border-radius:4px;margin-bottom:4px;display:flex;gap:12px;}
  .msg:hover{background:rgba(0,0,0,0.1);}
  .avatar{width:40px;height:40px;border-radius:50%;flex-shrink:0;background:#5865f2;}
  .body{flex:1;min-width:0;}
  .header{display:flex;align-items:baseline;gap:8px;margin-bottom:2px;}
  .user{font-weight:600;color:#fff;}
  .bot{background:#5865f2;color:#fff;font-size:10px;padding:1px 4px;border-radius:3px;text-transform:uppercase;}
  .time{font-size:11px;color:#72767d;}
  .content{color:#dcddde;white-space:pre-wrap;word-wrap:break-word;}
  .embed{margin-top:6px;padding:8px 12px;border-left:4px solid #5865f2;background:#2f3136;border-radius:4px;font-size:13px;}
  .attach{margin-top:4px;font-size:12px;color:#00aff4;}
</style></head><body>`;

function esc(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function fetchAllMessages(ch: TextChannel): Promise<Message[]> {
  const out: Message[] = [];
  let before: string | undefined;
  // safety cap: 5000 messages
  for (let i = 0; i < 50; i++) {
    const batch: Collection<string, Message> = await ch.messages.fetch({ limit: 100, before }).catch(() => new Collection());
    if (batch.size === 0) break;
    for (const m of batch.values()) out.push(m);
    before = batch.last()?.id;
    if (batch.size < 100) break;
  }
  return out.reverse(); // chronological
}

export async function generateHtmlTranscript(ticket: TicketRecord, channel: TextChannel): Promise<Buffer> {
  const msgs = await fetchAllMessages(channel);
  const padded = String(ticket.number).padStart(4, '0');
  const opened = new Date(ticket.created_at * 1000).toISOString();
  const closed = ticket.closed_at ? new Date(ticket.closed_at * 1000).toISOString() : 'still open';

  let body = HTML_HEAD;
  body += `<div class="meta">
    <h1>🎫 Ticket #${padded}</h1>
    <div><strong>Server:</strong> ${esc(channel.guild.name)}</div>
    <div><strong>Channel:</strong> #${esc(channel.name)}</div>
    <div><strong>Opener:</strong> &lt;@${ticket.user_id}&gt;</div>
    <div><strong>Opened:</strong> ${opened}</div>
    <div><strong>Closed:</strong> ${closed}</div>
    <div><strong>Messages:</strong> ${msgs.length}</div>
  </div>`;

  for (const m of msgs) {
    const ts = new Date(m.createdTimestamp).toISOString();
    const botTag = m.author.bot ? '<span class="bot">BOT</span>' : '';
    body += `<div class="msg">
      <div class="avatar"></div>
      <div class="body">
        <div class="header"><span class="user">${esc(m.author.username)}</span>${botTag}<span class="time">${ts}</span></div>
        <div class="content">${esc(m.content || '')}</div>`;
    for (const e of m.embeds) {
      const t = e.title ? `<strong>${esc(e.title)}</strong><br>` : '';
      const d = e.description ? esc(e.description) : '';
      body += `<div class="embed">${t}${d}</div>`;
    }
    for (const a of m.attachments.values()) {
      body += `<div class="attach">📎 <a href="${esc(a.url)}" style="color:#00aff4">${esc(a.name ?? 'attachment')}</a></div>`;
    }
    body += `</div></div>`;
  }
  body += `</body></html>`;
  return Buffer.from(body, 'utf-8');
}

export async function generateTxtTranscript(ticket: TicketRecord, channel: TextChannel): Promise<Buffer> {
  const msgs = await fetchAllMessages(channel);
  const padded = String(ticket.number).padStart(4, '0');

  const lines: string[] = [];
  lines.push(`=== Ticket #${padded} ===`);
  lines.push(`Server:   ${channel.guild.name}`);
  lines.push(`Channel:  #${channel.name}`);
  lines.push(`Opener:   ${ticket.user_id}`);
  lines.push(`Opened:   ${new Date(ticket.created_at * 1000).toISOString()}`);
  lines.push(`Closed:   ${ticket.closed_at ? new Date(ticket.closed_at * 1000).toISOString() : 'still open'}`);
  lines.push(`Messages: ${msgs.length}`);
  lines.push('');
  lines.push('─'.repeat(60));
  lines.push('');
  for (const m of msgs) {
    const ts = new Date(m.createdTimestamp).toISOString();
    const tag = m.author.bot ? ' [BOT]' : '';
    lines.push(`[${ts}] ${m.author.username}${tag}:`);
    if (m.content) lines.push(`  ${m.content.split('\n').join('\n  ')}`);
    for (const e of m.embeds) {
      if (e.title)       lines.push(`  ▸ EMBED ${e.title}`);
      if (e.description) lines.push(`    ${e.description.split('\n').join('\n    ')}`);
    }
    for (const a of m.attachments.values()) {
      lines.push(`  📎 ${a.name ?? 'attachment'} → ${a.url}`);
    }
    lines.push('');
  }
  return Buffer.from(lines.join('\n'), 'utf-8');
}

export async function generateTranscript(
  ticket: TicketRecord,
  channel: TextChannel,
  format: 'html' | 'txt',
): Promise<{ buffer: Buffer; filename: string }> {
  const padded = String(ticket.number).padStart(4, '0');
  if (format === 'txt') {
    return { buffer: await generateTxtTranscript(ticket, channel), filename: `transcript-${padded}.txt` };
  }
  return { buffer: await generateHtmlTranscript(ticket, channel), filename: `transcript-${padded}.html` };
}
