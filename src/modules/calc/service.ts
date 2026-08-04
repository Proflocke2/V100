/**
 * /calc — a plain, transparent trade calculator both parties can see and
 * confirm. Not tied to the bot's own economy system (no assumption the
 * trade is in bot-coins, or that any particular currency is used at all)
 * — it's just quantity × price per unit, formatted clearly, with a
 * two-button confirm flow so there's a visible record in the channel that
 * both sides agreed to the same numbers. Built to kill "I calculated it
 * differently" disputes, not to be a general economy feature.
 *
 * State lives in `calc_deals` so a restart between confirm-clicks doesn't
 * lose anything — the button's customId only carries the deal ID,
 * everything else is read fresh from the DB on click.
 */

import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ButtonInteraction,
  ChatInputCommandInteraction, EmbedBuilder,
} from 'discord.js';
import db from '../../database/db';

db.exec(`
  CREATE TABLE IF NOT EXISTS calc_deals (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id         TEXT NOT NULL,
    item             TEXT NOT NULL,
    quantity         INTEGER NOT NULL,
    price_per_unit   REAL NOT NULL,
    total            REAL NOT NULL,
    buyer_id         TEXT NOT NULL,
    seller_id        TEXT NOT NULL,
    buyer_confirmed  INTEGER DEFAULT 0,
    seller_confirmed INTEGER DEFAULT 0,
    created_by       TEXT NOT NULL,
    created_at       INTEGER DEFAULT (unixepoch())
  );
`);

export interface CalcDeal {
  id: number;
  guild_id: string;
  item: string;
  quantity: number;
  price_per_unit: number;
  total: number;
  buyer_id: string;
  seller_id: string;
  buyer_confirmed: number;
  seller_confirmed: number;
  created_by: string;
  created_at: number;
}

function fmt(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function createDeal(
  guildId: string,
  item: string,
  quantity: number,
  pricePerUnit: number,
  buyerId: string,
  sellerId: string,
  createdBy: string,
): CalcDeal {
  const total = quantity * pricePerUnit;
  const res = db.prepare(
    'INSERT INTO calc_deals (guild_id, item, quantity, price_per_unit, total, buyer_id, seller_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(guildId, item, quantity, pricePerUnit, total, buyerId, sellerId, createdBy);
  return getDeal(res.lastInsertRowid as number)!;
}

export function getDeal(id: number): CalcDeal | null {
  return (db.prepare('SELECT * FROM calc_deals WHERE id = ?').get(id) as CalcDeal | undefined) ?? null;
}

function confirmSide(id: number, side: 'buyer' | 'seller'): void {
  db.prepare(`UPDATE calc_deals SET ${side}_confirmed = 1 WHERE id = ?`).run(id);
}

export function buildDealEmbed(deal: CalcDeal): EmbedBuilder {
  const bothConfirmed = !!deal.buyer_confirmed && !!deal.seller_confirmed;
  return new EmbedBuilder()
    .setTitle('🧮 Trade Calculation')
    .setColor(bothConfirmed ? '#57f287' : '#f1c40f')
    .addFields(
      { name: 'Item',           value: deal.item, inline: true },
      { name: 'Quantity',       value: fmt(deal.quantity), inline: true },
      { name: 'Price per unit', value: fmt(deal.price_per_unit), inline: true },
      { name: 'Total',          value: `**${fmt(deal.total)}**` },
      {
        name:   'Buyer',
        value:  `<@${deal.buyer_id}> — ${deal.buyer_confirmed ? '✅ Confirmed' : '⏳ Pending'}`,
        inline: true,
      },
      {
        name:   'Seller',
        value:  `<@${deal.seller_id}> — ${deal.seller_confirmed ? '✅ Confirmed' : '⏳ Pending'}`,
        inline: true,
      },
    )
    .setFooter({
      text: bothConfirmed
        ? 'Both parties confirmed this calculation.'
        : 'Both parties must confirm below.',
    })
    .setTimestamp();
}

export function buildDealButtons(deal: CalcDeal): ActionRowBuilder<ButtonBuilder> {
  const buyerBtn = new ButtonBuilder()
    .setCustomId(`calc:confirm:${deal.id}:buyer`)
    .setLabel(deal.buyer_confirmed ? '✅ Buyer Confirmed' : '✅ Confirm (Buyer)')
    .setStyle(deal.buyer_confirmed ? ButtonStyle.Secondary : ButtonStyle.Success)
    .setDisabled(!!deal.buyer_confirmed);

  const sellerBtn = new ButtonBuilder()
    .setCustomId(`calc:confirm:${deal.id}:seller`)
    .setLabel(deal.seller_confirmed ? '✅ Seller Confirmed' : '✅ Confirm (Seller)')
    .setStyle(deal.seller_confirmed ? ButtonStyle.Secondary : ButtonStyle.Success)
    .setDisabled(!!deal.seller_confirmed);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(buyerBtn, sellerBtn);
}

export async function executeCalc(interaction: ChatInputCommandInteraction): Promise<void> {
  const item     = interaction.options.getString('item', true);
  const quantity = interaction.options.getInteger('quantity', true);
  const price    = interaction.options.getNumber('price', true);
  const buyer    = interaction.options.getUser('buyer', true);
  const seller   = interaction.options.getUser('seller', true);

  if (buyer.id === seller.id) {
    await interaction.reply({ content: '❌ Buyer and seller must be two different people.', ephemeral: true });
    return;
  }
  if (buyer.bot || seller.bot) {
    await interaction.reply({ content: '❌ Buyer and seller must both be real users, not bots.', ephemeral: true });
    return;
  }

  const deal = createDeal(interaction.guildId!, item, quantity, price, buyer.id, seller.id, interaction.user.id);

  await interaction.reply({
    content:    `<@${buyer.id}> <@${seller.id}>`,
    embeds:     [buildDealEmbed(deal)],
    components: [buildDealButtons(deal)],
  });
}

/** Routed from events/interactionCreate.ts for any customId starting with 'calc:confirm:'. */
export async function handleCalcConfirmButton(btn: ButtonInteraction): Promise<void> {
  const parts  = btn.customId.split(':'); // calc:confirm:<id>:<side>
  const dealId = Number(parts[2]);
  const side   = parts[3] as 'buyer' | 'seller';

  const deal = getDeal(dealId);
  if (!deal) {
    await btn.reply({ content: '❌ This calculation no longer exists.', ephemeral: true });
    return;
  }

  const expectedUserId = side === 'buyer' ? deal.buyer_id : deal.seller_id;
  if (btn.user.id !== expectedUserId) {
    await btn.reply({ content: `❌ Only <@${expectedUserId}> can confirm as the ${side}.`, ephemeral: true });
    return;
  }

  const alreadyConfirmed = side === 'buyer' ? deal.buyer_confirmed : deal.seller_confirmed;
  if (alreadyConfirmed) {
    await btn.reply({ content: '✅ You already confirmed this calculation.', ephemeral: true });
    return;
  }

  confirmSide(dealId, side);
  const updated = getDeal(dealId)!;

  await btn.update({
    embeds:     [buildDealEmbed(updated)],
    components: [buildDealButtons(updated)],
  });
}
