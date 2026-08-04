/**
 * /chess — Full Chess using chess.js (battle-tested rules engine)
 *
 * Move UI: Select piece from dropdown → select target square from dropdown
 * All rules handled by chess.js: castling, en passant, promotion, check, checkmate, draw
 *
 * Board: emoji grid rendered from chess.js board() array
 * PvE: AI uses chess.js moves() with material evaluation
 * PvP: alternating turns, challenge system
 * Economy: optional bet on outcome
 *
 * Variants:
 *   standard  — classic chess
 *   chess960  — random starting position (Fischer Random)
 */

import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder,
  ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ButtonBuilder, ButtonStyle, ComponentType, ButtonInteraction,
  User, MessageFlags,
} from 'discord.js';
import { Chess, Square, PieceSymbol, Color } from 'chess.js';
import { getGuild } from '../../database/db';
import { Language } from '../../utils/localization';
import { reservePoints, addPoints, recordLoss } from '../../economy/db/EconomyDB';
import { validateBet } from '../../utils/betHelper';

// ── Board rendering ───────────────────────────────────────────────────────────

const PIECE_EMOJI: Record<string, string> = {
  wK:'♔', wQ:'♕', wR:'♖', wB:'♗', wN:'♘', wP:'♙',
  bK:'♚', bQ:'♛', bR:'♜', bB:'♝', bN:'♞', bP:'♟',
};
const LIGHT = '⬜'; const DARK = '⬛';
const FILES = ['a','b','c','d','e','f','g','h'];

function renderBoard(chess: Chess, flipped = false): string {
  const board = chess.board();
  const ranks = flipped ? [0,1,2,3,4,5,6,7] : [7,6,5,4,3,2,1,0];
  const files = flipped ? [7,6,5,4,3,2,1,0] : [0,1,2,3,4,5,6,7];
  const rankLabels = ranks.map(r => r + 1);
  const fileLabel = files.map(c => FILES[c]).join('');

  const rows = ranks.map((r, ri) => {
    const label = `\`${rankLabels[ri]}\``;
    const cells = files.map((c, ci) => {
      const sq = board[7 - r]?.[c];
      const bg = (r + c) % 2 === 0 ? DARK : LIGHT;
      if (!sq) return bg;
      return PIECE_EMOJI[`${sq.color}${sq.type.toUpperCase()}`] ?? bg;
    }).join('');
    return `${label}${cells}`;
  });

  return rows.join('\n') + `\n\`  ${fileLabel}\``;
}

// ── AI ────────────────────────────────────────────────────────────────────────

const PIECE_VALUE: Record<PieceSymbol, number> = {
  k: 0, q: 9, r: 5, b: 3, n: 3, p: 1,
};

function aiMove(chess: Chess): string | null {
  const moves = chess.moves({ verbose: true });
  if (!moves.length) return null;

  // Score each move: captures > center control > random
  const scored = moves.map(m => {
    let score = Math.random() * 0.5; // base randomness
    if (m.captured) score += PIECE_VALUE[m.captured] * 10;
    if (m.flags.includes('k') || m.flags.includes('q')) score += 2; // castling bonus
    if (['d4','d5','e4','e5'].includes(m.to)) score += 1; // center
    if (chess.isCheck()) score += 3; // prefer checking moves
    return { m, score };
  });

  scored.sort((a, b) => b.score - a.score);
  // Pick from top 3 for variety
  const top = scored.slice(0, Math.min(3, scored.length));
  return top[Math.floor(Math.random() * top.length)].m.san;
}

// ── Select menus ──────────────────────────────────────────────────────────────

function buildPieceMenu(chess: Chess, gameId: string): ActionRowBuilder<StringSelectMenuBuilder>[] {
  const board = chess.board();
  const turn = chess.turn();
  const opts: StringSelectMenuOptionBuilder[] = [];

  for (let r = 7; r >= 0; r--) {
    for (let c = 0; c < 8; c++) {
      const sq = board[7 - r]?.[c];
      if (!sq || sq.color !== turn) continue;
      const square = `${FILES[c]}${r + 1}` as Square;
      const moves = chess.moves({ square, verbose: true });
      if (!moves.length) continue;
      const emoji = PIECE_EMOJI[`${sq.color}${sq.type.toUpperCase()}`];
      opts.push(new StringSelectMenuOptionBuilder()
        .setLabel(`${emoji} ${sq.type.toUpperCase()} on ${square} (${moves.length} move${moves.length !== 1 ? 's' : ''})`)
        .setValue(square),
      );
    }
  }

  if (!opts.length) opts.push(new StringSelectMenuOptionBuilder().setLabel('No moves').setValue('none'));

  return [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`ch_piece_${gameId}`)
      .setPlaceholder(`${turn === 'w' ? '⬜ White' : '⬛ Black'} — select a piece`)
      .addOptions(opts.slice(0, 25)),
  )];
}

function buildMoveMenu(chess: Chess, gameId: string, from: Square): ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] {
  const moves = chess.moves({ square: from, verbose: true });
  const opts = moves.map(m => {
    const captured = m.captured ? ` × ${PIECE_EMOJI[`${m.color === 'w' ? 'b' : 'w'}${m.captured.toUpperCase()}`] ?? '?'}` : '';
    const flag = m.flags.includes('k') ? ' 0-0' : m.flags.includes('q') ? ' 0-0-0' : m.flags.includes('e') ? ' e.p.' : '';
    return new StringSelectMenuOptionBuilder()
      .setLabel(`→ ${m.to}${captured}${flag} (${m.san})`)
      .setValue(m.san);
  });

  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`ch_move_${gameId}`)
        .setPlaceholder(`Select target for ${from}`)
        .addOptions(opts.slice(0, 25)),
    ) as any,
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`ch_back_${gameId}`).setLabel('◀ Back').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`ch_resign_${gameId}`).setLabel('🏳 Resign').setStyle(ButtonStyle.Danger),
    ) as any,
  ];
}

function resignRow(gameId: string): ActionRowBuilder<ButtonBuilder>[] {
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`ch_resign_${gameId}`).setLabel('🏳 Resign').setStyle(ButtonStyle.Danger),
  )];
}

// ── Chess960 position generator ───────────────────────────────────────────────

function generateChess960Fen(): string {
  // Place pieces on back rank following Chess960 rules
  const rank: (string | null)[] = Array(8).fill(null);
  const shuffle = (arr: number[]) => arr.sort(() => Math.random() - 0.5);

  // Bishops on opposite colors
  const lightSqs = [1, 3, 5, 7]; const darkSqs = [0, 2, 4, 6];
  rank[lightSqs[Math.floor(Math.random() * 4)]] = 'B';
  rank[darkSqs[Math.floor(Math.random() * 4)]]  = 'B';

  // Queen, then two knights in remaining squares
  const empty = () => rank.map((v,i)=>v===null?i:-1).filter(i=>i>=0);
  const e1 = shuffle(empty()); rank[e1[0]] = 'Q'; rank[e1[1]] = 'N'; rank[e1[2]] = 'N';

  // Rook, King, Rook in remaining 3 squares (must be in this order)
  const e2 = empty(); rank[e2[0]] = 'R'; rank[e2[1]] = 'K'; rank[e2[2]] = 'R';

  const backRank = rank.join('').toLowerCase();
  const fen = `${backRank}/pppppppp/8/8/8/8/PPPPPPPP/${backRank.toUpperCase()} w KQkq - 0 1`;
  return fen;
}



interface ChessGame {
  chess: Chess;
  wId: string; bId: string;
  pvp: boolean; bet: number; guildId: string;
  done: boolean; createdAt: number;
}

const sessions = new Map<string, ChessGame>();
setInterval(() => {
  const cutoff = Date.now() - 120 * 60_000;
  sessions.forEach((v, k) => { if (v.createdAt < cutoff) sessions.delete(k); });
}, 20 * 60_000);

// ── Embed ─────────────────────────────────────────────────────────────────────

function gameEmbed(g: ChessGame, label = ''): EmbedBuilder {
  const { chess } = g;
  const turn = chess.turn();
  const currentId = turn === 'w' ? g.wId : g.bId;
  const status = chess.isCheckmate() ? '♟️ Checkmate!' :
    chess.isStalemate()   ? '🤝 Stalemate' :
    chess.isDraw()        ? '🤝 Draw' :
    chess.isCheck()       ? '⚠️ Check!' : 'Playing';

  return new EmbedBuilder()
    .setTitle('♟️ Chess')
    .setColor('#a0522d')
    .setDescription(renderBoard(chess))
    .addFields(
      { name: 'Turn', value: `${turn === 'w' ? '⬜ White' : '⬛ Black'} — ${g.pvp || turn === 'w' ? `<@${currentId}>` : '🤖 AI'}`, inline: true },
      { name: 'Status', value: status, inline: true },
      ...(g.bet > 0 ? [{ name: 'Bet', value: `🪙 ${g.bet}`, inline: true }] : []),
      ...(label ? [{ name: 'Last move', value: label }] : []),
    );
}

// ── Economy ───────────────────────────────────────────────────────────────────

function payout(winnerId: string, loserId: string, guildId: string, bet: number): void {
  if (bet <= 0) return;
  addPoints(winnerId, guildId, bet * 2);
  recordLoss(loserId, guildId, bet);
}

function refund(g: ChessGame): void {
  if (g.bet <= 0) return;
  addPoints(g.wId, g.guildId, g.bet);
  if (g.pvp) addPoints(g.bId, g.guildId, g.bet);
}

// ── Core game runner ──────────────────────────────────────────────────────────

async function runGame(
  ix: ChatInputCommandInteraction,
  chess: Chess,
  wId: string,
  bId: string,
  pvp: boolean,
  bet: number,
): Promise<void> {
  const gameId = `ch_${wId}_${Date.now()}`;
  const g: ChessGame = { chess, wId, bId, pvp, bet, guildId: ix.guildId!, done: false, createdAt: Date.now() };
  sessions.set(wId, g);
  sessions.set(bId, g);

  const msg = await ix.editReply({
    embeds: [gameEmbed(g)],
    components: buildPieceMenu(chess, gameId) as any,
  });

  const col = msg.createMessageComponentCollector({
    filter: b => (b.user.id === wId || b.user.id === bId) && b.customId.includes(gameId),
    time: 120 * 60_000,
  });

  let selectedFrom: Square | null = null;

  col.on('collect', async (inter: any) => {
    const gg = sessions.get(inter.user.id);
    if (!gg || gg.done) return inter.deferUpdate();

    const currentId = gg.chess.turn() === 'w' ? gg.wId : gg.bId;
    const id = inter.customId;

    // ── Resign ────────────────────────────────────────────────────────────────
    if (id === `ch_resign_${gameId}`) {
      if (inter.user.id !== currentId) return inter.reply({ content: 'Not your turn.', flags: MessageFlags.Ephemeral });
      const winnerId = gg.chess.turn() === 'w' ? gg.bId : gg.wId;
      if (gg.bet > 0) payout(winnerId, currentId, gg.guildId, gg.bet);
      gg.done = true;
      sessions.delete(gg.wId); sessions.delete(gg.bId);
      col.stop();
      await inter.deferUpdate();
      return ix.editReply({
        embeds: [new EmbedBuilder().setTitle('🏳 Resignation').setColor('#ed4245')
          .setDescription(`${renderBoard(gg.chess)}\n\n<@${inter.user.id}> resigned. <@${winnerId}> wins!${gg.bet > 0 ? `\n🪙 +${gg.bet * 2} coins for winner!` : ''}`)],
        components: [],
      });
    }

    // ── Back ──────────────────────────────────────────────────────────────────
    if (id === `ch_back_${gameId}`) {
      selectedFrom = null;
      return inter.update({ embeds: [gameEmbed(gg)], components: buildPieceMenu(gg.chess, gameId) as any });
    }

    // ── Piece selection ───────────────────────────────────────────────────────
    if (id === `ch_piece_${gameId}`) {
      if (inter.user.id !== currentId) return inter.reply({ content: 'Not your turn!', flags: MessageFlags.Ephemeral });
      const sqRaw = inter.values[0];
      if (sqRaw === 'none') return inter.deferUpdate();
      const sq = sqRaw as Square;
      selectedFrom = sq;
      const embed = gameEmbed(gg, `Selected: ${sq}`);
      return inter.update({ embeds: [embed], components: buildMoveMenu(gg.chess, gameId, sq) as any });
    }

    // ── Move execution ────────────────────────────────────────────────────────
    if (id === `ch_move_${gameId}`) {
      if (inter.user.id !== currentId) return inter.reply({ content: 'Not your turn!', flags: MessageFlags.Ephemeral });
      if (!selectedFrom) return inter.deferUpdate();

      const san = inter.values[0];
      try {
        gg.chess.move(san);
      } catch {
        return inter.reply({ content: 'Invalid move — please try again.', flags: MessageFlags.Ephemeral });
      }
      selectedFrom = null;

      // ── Check game over ───────────────────────────────────────────────────
      if (gg.chess.isGameOver()) {
        gg.done = true;
        sessions.delete(gg.wId); sessions.delete(gg.bId);
        col.stop();

        let title: string; let desc: string;
        if (gg.chess.isCheckmate()) {
          const winner = gg.chess.turn() === 'w' ? gg.bId : gg.wId;
          const loser  = gg.chess.turn() === 'w' ? gg.wId : gg.bId;
          if (gg.bet > 0) payout(winner, loser, gg.guildId, gg.bet);
          title = '♟️ Checkmate!';
          desc = `<@${winner}> wins by checkmate!${gg.bet > 0 ? `\n🪙 +${gg.bet * 2} coins!` : ''}`;
        } else {
          refund(gg);
          title = gg.chess.isStalemate() ? '🤝 Stalemate!' : '🤝 Draw!';
          desc = `It's a draw.${gg.bet > 0 ? '\n🪙 Bets refunded.' : ''}`;
        }

        await inter.deferUpdate();
        return ix.editReply({
          embeds: [new EmbedBuilder().setTitle(title).setColor('#57f287')
            .setDescription(`${renderBoard(gg.chess)}\n\n${desc}`)
            .setTimestamp()],
          components: [],
        });
      }

      await inter.update({ embeds: [gameEmbed(gg, san)], components: buildPieceMenu(gg.chess, gameId) as any });

      // ── AI turn ───────────────────────────────────────────────────────────
      if (!gg.pvp && gg.chess.turn() === 'b' && !gg.done) {
        setTimeout(async () => {
          if (gg.done) return;
          const move = aiMove(gg.chess);
          if (!move) return;
          try { gg.chess.move(move); } catch { return; }

          if (gg.chess.isGameOver()) {
            gg.done = true;
            sessions.delete(gg.wId); sessions.delete(gg.bId);
            col.stop();

            let title: string; let desc: string;
            if (gg.chess.isCheckmate()) {
              if (gg.bet > 0) recordLoss(gg.wId, gg.guildId, gg.bet);
              title = '🤖 Checkmate!'; desc = `AI wins by checkmate!${gg.bet > 0 ? `\n🪙 -${gg.bet} coins.` : ''}`;
            } else {
              refund(gg);
              title = '🤝 Draw!'; desc = `Draw.${gg.bet > 0 ? '\n🪙 Bet refunded.' : ''}`;
            }

            await ix.editReply({
              embeds: [new EmbedBuilder().setTitle(title).setColor('#ed4245')
                .setDescription(`${renderBoard(gg.chess)}\n\n${desc}`)],
              components: [],
            }).catch(() => {});
            return;
          }

          await ix.editReply({
            embeds: [gameEmbed(gg, `AI: ${move}`)],
            components: buildPieceMenu(gg.chess, gameId) as any,
          }).catch(() => {});
        }, 1000);
      }
    }
  });

  col.on('end', (_, reason) => {
    if (reason === 'time') {
      const gg = sessions.get(wId);
      if (gg && !gg.done) {
        refund(gg);
        sessions.delete(wId); sessions.delete(bId);
        ix.editReply({ embeds: [new EmbedBuilder().setColor('#ed4245').setDescription('♟️ Game expired (2h timeout). Bets refunded.')], components: [] }).catch(() => {});
      }
    }
  });
}

// ── Command ───────────────────────────────────────────────────────────────────

export default {
  data: new SlashCommandBuilder()
    .setName('chess')
    .setDescription('Chess — full rules via chess.js, select piece & target ♟️')
    .setDMPermission(false)
    .addSubcommand(s => s.setName('pve').setDescription('Play vs AI')
      .addStringOption(o => o.setName('variant').setDescription('Variant').addChoices(
        { name: 'Standard', value: 'standard' },
        { name: 'Chess960 (random start)', value: 'chess960' },
      ))
      .addIntegerOption(o => o.setName('bet').setDescription('Bet coins').setMinValue(1)))
    .addSubcommand(s => s.setName('pvp').setDescription('Challenge another player')
      .addUserOption(o => o.setName('opponent').setDescription('Opponent').setRequired(true))
      .addStringOption(o => o.setName('variant').setDescription('Variant').addChoices(
        { name: 'Standard', value: 'standard' },
        { name: 'Chess960 (random start)', value: 'chess960' },
      ))
      .addIntegerOption(o => o.setName('bet').setDescription('Bet coins each').setMinValue(1))),

  async execute(ix: ChatInputCommandInteraction) {
    const lang = (getGuild(ix.guildId!)?.language || 'en') as Language;
    const sub     = ix.options.getSubcommand();
    const variant = (ix.options.getString('variant') || 'standard');
    const { bet, warning: betWarning } = validateBet(ix.options.getInteger('bet') ?? 0, ix.guildId!);

    // Init chess instance
    const chess = variant === 'chess960'
      ? new Chess(generateChess960Fen())
      : new Chess();

    if (sub === 'pve') {
      if (bet > 0 && !reservePoints(ix.user.id, ix.guildId!, bet))
        return ix.reply({ embeds: [new EmbedBuilder().setColor('#ed4245').setDescription('❌ Insufficient coins.')], flags: MessageFlags.Ephemeral });

    if (betWarning) {
      await ix.followUp({ content: betWarning, ephemeral: true }).catch(() => {});
    }
      await ix.reply({ embeds: [new EmbedBuilder().setColor('#a0522d').setDescription('♟️ Setting up board...')], components: [] });
      return runGame(ix, chess, ix.user.id, 'AI', false, bet);
    }

    // PvP
    const opp = ix.options.getUser('opponent', true);
    if (opp.bot || opp.id === ix.user.id)
      return ix.reply({ embeds: [new EmbedBuilder().setColor('#ed4245').setDescription('❌ Invalid opponent.')], flags: MessageFlags.Ephemeral });
    if (sessions.has(ix.user.id) || sessions.has(opp.id))
      return ix.reply({ embeds: [new EmbedBuilder().setColor('#ed4245').setDescription('❌ One player already has an active game.')], flags: MessageFlags.Ephemeral });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('ch_acc').setLabel('Accept ✅').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ch_dec').setLabel('Decline ❌').setStyle(ButtonStyle.Danger),
    );

    const msg = await ix.reply({
      embeds: [new EmbedBuilder().setTitle('♟️ Chess Challenge').setColor('#a0522d')
        .setDescription(`<@${ix.user.id}> challenges <@${opp.id}> to Chess!${variant === 'chess960' ? ' (Chess960)' : ''}${bet > 0 ? `\n💰 Bet: **🪙 ${bet}** each` : ''}\n\n<@${opp.id}>, accept?`)
        .setFooter({ text: '60 seconds to respond' })],
      components: [row],
      fetchReply: true,
    });

    const col = msg.createMessageComponentCollector({ componentType: ComponentType.Button, filter: b => b.user.id === opp.id, time: 60_000, max: 1 });

    col.on('collect', async (btn: ButtonInteraction) => {
      if (btn.customId === 'ch_dec')
        return btn.update({ embeds: [new EmbedBuilder().setColor('#ed4245').setDescription(`${opp.username} declined.`)], components: [] });

      if (bet > 0) {
        const ok1 = reservePoints(ix.user.id, ix.guildId!, bet);
        const ok2 = reservePoints(opp.id, ix.guildId!, bet);
        if (!ok1 || !ok2) {
          if (ok1) addPoints(ix.user.id, ix.guildId!, bet);
          if (ok2) addPoints(opp.id, ix.guildId!, bet);
          return btn.update({ embeds: [new EmbedBuilder().setColor('#ed4245').setDescription('❌ Insufficient coins.')], components: [] });
        }
      }

      await btn.update({ embeds: [new EmbedBuilder().setColor('#a0522d').setDescription('♟️ Game starting...')], components: [] });
      return runGame(ix, chess, ix.user.id, opp.id, true, bet);
    });

    col.on('end', (_, r) => {
      if (r === 'time') ix.editReply({ embeds: [new EmbedBuilder().setColor('#ed4245').setDescription('Challenge expired.')], components: [] }).catch(() => {});
    });
  },
};
