import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { setAfk, getAfk } from '../../modules/afk/service';

export default {
  data: new SlashCommandBuilder()
    .setName('afk')
    .setDescription('Set yourself as AFK — the bot will let people know when they mention you')
    .addStringOption(o => o
      .setName('reason')
      .setDescription('Reason (optional, shown when someone mentions you)')
      .setMaxLength(200),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const reason  = interaction.options.getString('reason') ?? null;
    const guildId = interaction.guildId!;
    const userId  = interaction.user.id;

    // If already AFK, update the reason and confirm
    const existing = getAfk(guildId, userId);
    setAfk(guildId, userId, reason);

    const msg = existing
      ? `✅ AFK status updated${reason ? ` — *${reason}*` : '.'}`
      : `😴 You're now AFK${reason ? ` — *${reason}*` : '.'}  I'll let people know when they mention you.`;

    await interaction.reply({ content: msg, ephemeral: true });
  },
};
