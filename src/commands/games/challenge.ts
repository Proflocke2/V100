/**
 * /challenge - PvP game invite command
 * sends an invite to another player with accept/decline buttons
 */

import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel,
} from 'discord.js';
import { BotClient } from '../../utils/types';
import { error, success } from '../../utils/embeds';
import { GameManager, GameType } from '../../services/gameManager';

const GAME_NAMES: Record<GameType, string> = {
  tictactoe: '⭕ Tic Tac Toe',
  connectfour: '🔵 Connect Four',
  rps: '🪨📄✂️ Rock Paper Scissors (Best of 3)',
};

export default {
  data: new SlashCommandBuilder()
    .setName('challenge')
    .setDescription('Challenge another player to a game')
    .addUserOption(o =>
      o.setName('opponent')
        .setDescription('The player you want to challenge')
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName('game')
        .setDescription('Which game to play')
        .setRequired(true)
        .addChoices(
          { name: 'Tic Tac Toe', value: 'tictactoe' },
          { name: 'Connect Four', value: 'connectfour' },
          { name: 'Rock Paper Scissors', value: 'rps' }
        )
    ),

  async execute(interaction: ChatInputCommandInteraction, client: BotClient) {
    const opponent = interaction.options.getUser('opponent', true);
    const gameType = interaction.options.getString('game', true) as GameType;

    // basic validation
    if (opponent.bot) {
      return interaction.reply({
        embeds: [error('Cant challenge bots', 'Use the play commands to play against AI: `/play`')],
        ephemeral: true,
      });
    }

    if (opponent.id === interaction.user.id) {
      return interaction.reply({
        embeds: [error('Cant challenge yourself', 'Pick someone else!')],
        ephemeral: true,
      });
    }

    // try to create the invite
    const result = GameManager.createInvite(
      interaction.user.id,
      opponent.id,
      gameType,
      interaction.channelId
    );

    if ('error' in result) {
      return interaction.reply({
        embeds: [error('Cant create invite', result.error)],
        ephemeral: true,
      });
    }

    const invite = result;

    // build the invite embed
    const embed = new EmbedBuilder()
      .setTitle('🎮 Game Challenge!')
      .setDescription([
        `${opponent}, you've been challenged to a game by ${interaction.user}!`,
        '',
        `**Game:** ${GAME_NAMES[gameType]}`,
        `**Channel:** <#${interaction.channelId}>`,
        '',
        '⏰ This invite expires in **60 seconds**',
      ].join('\n'))
      .setColor('#5865f2')
      .setThumbnail(opponent.displayAvatarURL())
      .setFooter({ text: `From ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });

    // accept/decline buttons
    const acceptBtn = new ButtonBuilder()
      .setCustomId(`invite_accept_${invite.inviteId}`)
      .setLabel('Accept')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅');

    const declineBtn = new ButtonBuilder()
      .setCustomId(`invite_decline_${invite.inviteId}`)
      .setLabel('Decline')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('❌');

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(acceptBtn, declineBtn);

    const reply = await interaction.reply({
      content: `${opponent}`,
      embeds: [embed],
      components: [row],
      fetchReply: true,
    });

    // store message id for cleanup
    GameManager.setInviteMessage(invite.inviteId, reply.id);

    // schedule auto-expiry message after 60s
    setTimeout(async () => {
      const stillExists = GameManager.getInvite(invite.inviteId);
      if (stillExists) {
        // invite was never accepted/declined - remove and update message
        GameManager.removeInvite(invite.inviteId);
        try {
          const expiredEmbed = new EmbedBuilder()
            .setTitle('⏱️ Invitation Expired')
            .setDescription(`The challenge from ${interaction.user} to ${opponent} timed out.`)
            .setColor('#faa61a');
          await reply.edit({ content: '', embeds: [expiredEmbed], components: [] });
        } catch (err) {
          // message may have been deleted, ignore
        }
      }
    }, 60 * 1000);
  },
};
