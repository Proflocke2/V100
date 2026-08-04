/**
 * /shop — Economy shop with categories, level-gating, temp-roles,
 * multi-page navigation buttons, and the existing role-grant / stock system.
 *
 * Item types:
 *   role       – grants a Discord role permanently
 *   temp_role  – grants a Discord role for duration_hours hours, then removes it
 *   cosmetic   – logged to inventory only (admin defines what it means)
 *
 * Browsing: embedded pages of 5 items, prev/next buttons.
 * Button customIds: shop:next:<page>:<guildId>  shop:prev:<page>:<guildId>
 */

import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder,
  ButtonBuilder, ButtonStyle, ActionRowBuilder, ButtonInteraction,
  PermissionFlagsBits,
} from 'discord.js';
import db from '../../database/db';
import { getEconomyUser, addPoints } from '../../economy/db/EconomyDB';
import { getUser } from '../../database/db';
import { success, error } from '../../utils/embeds';
import { requireAdmin } from '../../utils/guards';
import { EconomyConfig } from '../../economy/config/EconomyConfig';

const PAGE_SIZE = 5;

// ── Schema ────────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS shop_items (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id        TEXT NOT NULL,
    name            TEXT NOT NULL,
    description     TEXT DEFAULT '',
    price           INTEGER NOT NULL,
    type            TEXT DEFAULT 'cosmetic',  -- 'role' | 'temp_role' | 'cosmetic'
    role_id         TEXT,
    duration_hours  INTEGER DEFAULT 0,        -- for temp_role; 0 = permanent
    level_required  INTEGER DEFAULT 0,        -- 0 = no gate
    category        TEXT DEFAULT 'General',
    stock           INTEGER DEFAULT -1,       -- -1 = unlimited
    repeatable      INTEGER DEFAULT 0,        -- 1 = can buy multiple times
    active          INTEGER DEFAULT 1,
    created_at      INTEGER DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS shop_inventory (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     TEXT NOT NULL,
    guild_id    TEXT NOT NULL,
    item_id     INTEGER NOT NULL,
    purchased_at INTEGER DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS shop_temp_roles (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id    TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    role_id     TEXT NOT NULL,
    expires_at  INTEGER NOT NULL
  );
`);

// ── Migrations for existing installs ──────────────────────────────────────────

for (const [col, def] of [
  ['type',           "TEXT DEFAULT 'cosmetic'"],
  ['duration_hours', 'INTEGER DEFAULT 0'],
  ['level_required', 'INTEGER DEFAULT 0'],
  ['category',       "TEXT DEFAULT 'General'"],
  ['repeatable',     'INTEGER DEFAULT 0'],
  ['active',         'INTEGER DEFAULT 1'],
] as [string, string][]) {
  try {
    const cols = (db.prepare("PRAGMA table_info(shop_items)").all() as any[]).map((c: any) => c.name);
    if (!cols.includes(col)) db.prepare(`ALTER TABLE shop_items ADD COLUMN ${col} ${def}`).run();
  } catch {}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string { return EconomyConfig.fmt(n); }

function getItems(guildId: string, onlyActive = true): any[] {
  const sql = onlyActive
    ? "SELECT * FROM shop_items WHERE guild_id=? AND active=1 AND (stock=-1 OR stock>0) ORDER BY category, price ASC"
    : "SELECT * FROM shop_items WHERE guild_id=? ORDER BY category, price ASC";
  return db.prepare(sql).all(guildId) as any[];
}

function ownsItem(userId: string, guildId: string, itemId: number): boolean {
  return !!db.prepare('SELECT 1 FROM shop_inventory WHERE user_id=? AND guild_id=? AND item_id=?').get(userId, guildId, itemId);
}

function buildPage(items: any[], page: number, guildId: string, userId?: string): { embed: EmbedBuilder; row: ActionRowBuilder<ButtonBuilder> } {
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const slice = items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const lines = slice.map(i => {
    const owned  = userId && !i.repeatable ? ownsItem(userId, guildId, i.id) : false;
    const locked = userId ? false : false;
    const tags: string[] = [];
    if (i.role_id)       tags.push(`Grants <@&${i.role_id}>${i.duration_hours ? ` for ${i.duration_hours}h` : ''}`);
    if (i.level_required) tags.push(`Req. Level ${i.level_required}`);
    if (i.stock !== -1)  tags.push(`${i.stock} left`);
    if (i.repeatable)    tags.push('Re-buyable');
    if (owned)           tags.push('✅ Owned');
    return `**#${i.id} ${i.name}** — ${fmt(i.price)}\n*${i.description || 'No description'}*${tags.length ? '\n' + tags.join(' • ') : ''}`;
  });

  const embed = new EmbedBuilder()
    .setTitle('🛍️ Server Shop')
    .setColor('#faa61a')
    .setDescription(slice.length ? lines.join('\n\n') : 'Nothing here.')
    .setFooter({ text: `Page ${page + 1}/${totalPages} • Use /shop buy <id> to purchase` });

  const categories = [...new Set(items.map(i => i.category as string))];
  if (categories.length > 1) embed.addFields({ name: 'Categories', value: categories.join(' • '), inline: true });

  const prevBtn = new ButtonBuilder().setCustomId(`shop:prev:${page}:${guildId}`).setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(page === 0);
  const nextBtn = new ButtonBuilder().setCustomId(`shop:next:${page}:${guildId}`).setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(prevBtn, nextBtn);
  return { embed, row };
}

// ── Button handler ────────────────────────────────────────────────────────────

export async function handleShopNav(btn: ButtonInteraction): Promise<void> {
  const parts = btn.customId.split(':'); // shop:prev/next:<page>:<guildId>
  const dir   = parts[1];
  const page  = parseInt(parts[2], 10);
  const newPage = dir === 'next' ? page + 1 : page - 1;
  const guildId = btn.guildId!;
  const items = getItems(guildId);
  const { embed, row } = buildPage(items, Math.max(0, newPage), guildId, btn.user.id);
  await btn.update({ embeds: [embed], components: [row] });
}

export function isShopNavButton(customId: string): boolean {
  return customId.startsWith('shop:prev:') || customId.startsWith('shop:next:');
}

// ── Temp-role expiry (called from schedulers) ─────────────────────────────────

export async function runShopTempRoleTick(client: any): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const due = db.prepare('SELECT * FROM shop_temp_roles WHERE expires_at <= ?').all(now) as any[];
  for (const r of due) {
    db.prepare('DELETE FROM shop_temp_roles WHERE id = ?').run(r.id);
    const guild = client.guilds.cache.get(r.guild_id);
    if (!guild) continue;
    const member = await guild.members.fetch(r.user_id).catch(() => null);
    if (member) await member.roles.remove(r.role_id).catch(() => {});
  }
}

// ── Command ───────────────────────────────────────────────────────────────────

export default {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Server item shop — spend your coins on roles and perks')

    .addSubcommand(s => s.setName('browse').setDescription('Browse available items'))

    .addSubcommand(s => s.setName('buy').setDescription('Buy an item')
      .addIntegerOption(o => o.setName('item_id').setDescription('Item ID from /shop browse').setRequired(true)))

    .addSubcommand(s => s.setName('inventory').setDescription('View your purchased items'))

    .addSubcommand(s => s.setName('add').setDescription('[Admin] Add a shop item')
      .addStringOption(o => o.setName('name').setDescription('Item name').setRequired(true).setMaxLength(80))
      .addIntegerOption(o => o.setName('price').setDescription('Price in coins').setRequired(true).setMinValue(1))
      .addStringOption(o => o.setName('type').setDescription('Item type').setRequired(true)
        .addChoices({ name: 'Role (permanent)', value: 'role' }, { name: 'Temp role (timed)', value: 'temp_role' }, { name: 'Cosmetic only', value: 'cosmetic' }))
      .addStringOption(o => o.setName('description').setDescription('Description shown in the shop'))
      .addRoleOption(o => o.setName('role').setDescription('Role to grant (for role/temp_role types)'))
      .addIntegerOption(o => o.setName('duration_hours').setDescription('Hours before temp role is removed (temp_role only)').setMinValue(1))
      .addIntegerOption(o => o.setName('level_required').setDescription('Minimum level to buy (0 = no gate)').setMinValue(0))
      .addStringOption(o => o.setName('category').setDescription('Category label (e.g. "Roles", "Cosmetics")').setMaxLength(50))
      .addIntegerOption(o => o.setName('stock').setDescription('Stock (-1 = unlimited)').setMinValue(-1))
      .addBooleanOption(o => o.setName('repeatable').setDescription('Allow buying multiple times? (default: no)')))

    .addSubcommand(s => s.setName('edit').setDescription('[Admin] Edit a shop item')
      .addIntegerOption(o => o.setName('item_id').setDescription('Item ID').setRequired(true))
      .addIntegerOption(o => o.setName('price').setDescription('New price'))
      .addStringOption(o => o.setName('description').setDescription('New description'))
      .addIntegerOption(o => o.setName('stock').setDescription('New stock').setMinValue(-1))
      .addIntegerOption(o => o.setName('level_required').setDescription('New level gate (0 = remove)').setMinValue(0))
      .addBooleanOption(o => o.setName('active').setDescription('Show in shop?')))

    .addSubcommand(s => s.setName('remove').setDescription('[Admin] Remove a shop item')
      .addIntegerOption(o => o.setName('item_id').setDescription('Item ID').setRequired(true)))

    .addSubcommand(s => s.setName('list-all').setDescription('[Admin] List all items including inactive/out-of-stock')),

  async execute(ix: ChatInputCommandInteraction) {
    const sub     = ix.options.getSubcommand();
    const guildId = ix.guildId!;

    // ── BROWSE ────────────────────────────────────────────────────────────────
    if (sub === 'browse') {
      const items = getItems(guildId);
      if (!items.length) return ix.reply({ embeds: [new EmbedBuilder().setTitle('🛍️ Shop').setColor('#faa61a').setDescription('No items available yet.')], ephemeral: true });
      const { embed, row } = buildPage(items, 0, guildId, ix.user.id);
      return ix.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    // ── BUY ───────────────────────────────────────────────────────────────────
    if (sub === 'buy') {
      const itemId = ix.options.getInteger('item_id', true);
      const item   = db.prepare('SELECT * FROM shop_items WHERE id=? AND guild_id=? AND active=1').get(itemId, guildId) as any;
      if (!item) return ix.reply({ embeds: [error('Item not found')], ephemeral: true });
      if (item.stock === 0) return ix.reply({ embeds: [error('Out of stock')], ephemeral: true });
      if (!item.repeatable && ownsItem(ix.user.id, guildId, itemId)) return ix.reply({ embeds: [error('Already owned')], ephemeral: true });

      if (item.level_required > 0) {
        const u = getUser(ix.user.id, guildId);
        if (u.level < item.level_required) return ix.reply({ embeds: [error('Level too low', `This item requires Level **${item.level_required}**. You are Level **${u.level}**.`)], ephemeral: true });
      }

      const eco = getEconomyUser(ix.user.id, guildId);
      if (eco.points < item.price) return ix.reply({ embeds: [error('Insufficient funds', `Need ${fmt(item.price)} — you have ${fmt(eco.points)}`)], ephemeral: true });

      addPoints(ix.user.id, guildId, -item.price);
      db.prepare('INSERT INTO shop_inventory (user_id, guild_id, item_id) VALUES (?,?,?)').run(ix.user.id, guildId, itemId);
      if (item.stock !== -1) db.prepare('UPDATE shop_items SET stock=stock-1 WHERE id=?').run(itemId);

      const details: string[] = [`**${item.name}** purchased for ${fmt(item.price)}.`];

      if (item.role_id && ix.guild) {
        const member = await ix.guild.members.fetch(ix.user.id).catch(() => null);
        if (member) {
          await member.roles.add(item.role_id).catch(() => {});
          details.push(`<@&${item.role_id}> granted.`);
          if (item.type === 'temp_role' && item.duration_hours > 0) {
            const expiresAt = Math.floor(Date.now() / 1000) + item.duration_hours * 3600;
            db.prepare('INSERT INTO shop_temp_roles (guild_id, user_id, role_id, expires_at) VALUES (?,?,?,?)').run(guildId, ix.user.id, item.role_id, expiresAt);
            details.push(`Expires in **${item.duration_hours}h** (<t:${expiresAt}:R>).`);
          }
        }
      }

      return ix.reply({ embeds: [success('Purchase successful!', details.join('\n'))] });
    }

    // ── INVENTORY ─────────────────────────────────────────────────────────────
    if (sub === 'inventory') {
      const rows = db.prepare(`
        SELECT si.*, s.name, s.description, s.type FROM shop_inventory si
        JOIN shop_items s ON s.id = si.item_id
        WHERE si.user_id=? AND si.guild_id=? ORDER BY si.purchased_at DESC`).all(ix.user.id, guildId) as any[];
      if (!rows.length) return ix.reply({ embeds: [new EmbedBuilder().setTitle('🎒 Inventory').setColor('#5865f2').setDescription('Nothing purchased yet.')], ephemeral: true });
      const lines = rows.map(r => `• **${r.name}** *(${r.type})* — *${r.description || 'No description'}*`);
      return ix.reply({ embeds: [new EmbedBuilder().setTitle('🎒 Your Inventory').setColor('#5865f2').setDescription(lines.join('\n'))], ephemeral: true });
    }

    // ── ADD ───────────────────────────────────────────────────────────────────
    if (sub === 'add') {
      if (!await requireAdmin(ix)) return;
      const type  = ix.options.getString('type', true);
      const role  = ix.options.getRole('role');
      if ((type === 'role' || type === 'temp_role') && !role) {
        return ix.reply({ embeds: [error('Role required', 'Provide a role for this item type.')], ephemeral: true });
      }
      const res = db.prepare(`
        INSERT INTO shop_items (guild_id, name, description, price, type, role_id, duration_hours, level_required, category, stock, repeatable)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
        guildId,
        ix.options.getString('name', true),
        ix.options.getString('description') ?? '',
        ix.options.getInteger('price', true),
        type,
        role?.id ?? null,
        ix.options.getInteger('duration_hours') ?? 0,
        ix.options.getInteger('level_required') ?? 0,
        ix.options.getString('category') ?? 'General',
        ix.options.getInteger('stock') ?? -1,
        ix.options.getBoolean('repeatable') ? 1 : 0,
      );
      return ix.reply({ embeds: [success('Item added', `**${ix.options.getString('name', true)}** added as #${res.lastInsertRowid}.`)], ephemeral: true });
    }

    // ── EDIT ──────────────────────────────────────────────────────────────────
    if (sub === 'edit') {
      if (!await requireAdmin(ix)) return;
      const itemId = ix.options.getInteger('item_id', true);
      const item   = db.prepare('SELECT * FROM shop_items WHERE id=? AND guild_id=?').get(itemId, guildId) as any;
      if (!item) return ix.reply({ embeds: [error('Not found')], ephemeral: true });

      const updates: string[] = [];
      const vals: any[] = [];
      const price = ix.options.getInteger('price');
      const desc  = ix.options.getString('description');
      const stock = ix.options.getInteger('stock');
      const lvl   = ix.options.getInteger('level_required');
      const active = ix.options.getBoolean('active');
      if (price !== null) { updates.push('price = ?'); vals.push(price); }
      if (desc !== null)  { updates.push('description = ?'); vals.push(desc); }
      if (stock !== null) { updates.push('stock = ?'); vals.push(stock); }
      if (lvl !== null)   { updates.push('level_required = ?'); vals.push(lvl); }
      if (active !== null){ updates.push('active = ?'); vals.push(active ? 1 : 0); }
      if (!updates.length) return ix.reply({ embeds: [error('Nothing to update')], ephemeral: true });
      vals.push(itemId);
      db.prepare(`UPDATE shop_items SET ${updates.join(', ')} WHERE id = ?`).run(...vals);
      return ix.reply({ embeds: [success('Updated', `Item #${itemId} updated.`)], ephemeral: true });
    }

    // ── REMOVE ────────────────────────────────────────────────────────────────
    if (sub === 'remove') {
      if (!await requireAdmin(ix)) return;
      const itemId = ix.options.getInteger('item_id', true);
      const item   = db.prepare('SELECT * FROM shop_items WHERE id=? AND guild_id=?').get(itemId, guildId) as any;
      if (!item) return ix.reply({ embeds: [error('Not found')], ephemeral: true });
      db.prepare('DELETE FROM shop_items WHERE id=?').run(itemId);
      return ix.reply({ embeds: [success('Removed', `**${item.name}** deleted.`)], ephemeral: true });
    }

    // ── LIST ALL ──────────────────────────────────────────────────────────────
    if (sub === 'list-all') {
      if (!await requireAdmin(ix)) return;
      const items = getItems(guildId, false);
      if (!items.length) return ix.reply({ embeds: [error('No items')], ephemeral: true });
      const lines = items.map(i =>
        `**#${i.id}** ${i.active ? '' : '~~'}${i.name}${i.active ? '' : '~~'} — ${fmt(i.price)} | ${i.type} | ${i.category} | stock:${i.stock === -1 ? '∞' : i.stock}${i.level_required ? ` | L${i.level_required}+` : ''}`
      );
      const pages = [];
      for (let i = 0; i < lines.length; i += 20) pages.push(lines.slice(i, i + 20).join('\n'));
      return ix.reply({ embeds: pages.map(p => new EmbedBuilder().setTitle('🛍️ All Shop Items').setColor('#faa61a').setDescription(p)), ephemeral: true });
    }
  },
};
