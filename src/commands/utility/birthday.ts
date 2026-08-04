/**
 * /birthday — birthday tracking + daily greetings.
 *   set      ← save your own birthday (month/day required, year optional & private)
 *   remove   ← delete your own entry
 *   upcoming ← next 5 birthdays in the server
 *   config   ← admin: channel, optional role, ping hour
 *
 * Only ever sets your OWN birthday — no setting it for someone else, by design.
 */

import {
  SlashCommandBuilder, ChatInputCommandInteraction, ChannelType,
} from 'discord.js';
import { success, error, info } from '../../utils/embeds';
import { requireAdmin } from '../../utils/guards';
import * as Repo from '../../modules/birthday/repository';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Rejects calendar dates that don't exist (e.g. 31. Februar) — Feb 29 IS allowed here, the leap-year handling lives in dateUtils.ts's greeting logic, not in input validation. */
function isValidCalendarDate(month: number, day: number): boolean {
  if (month < 1 || month > 12) return false;
  const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1];
}

const data = new SlashCommandBuilder()
  .setName('birthday')
  .setDescription('Birthday tracking + daily greetings')

  .addSubcommand(s =>
    s.setName('set')
      .setDescription('Save your own birthday')
      .addIntegerOption(o => o.setName('month').setDescription('Month (1-12)').setRequired(true).setMinValue(1).setMaxValue(12))
      .addIntegerOption(o => o.setName('day').setDescription('Day (1-31)').setRequired(true).setMinValue(1).setMaxValue(31))
      .addIntegerOption(o => o.setName('year').setDescription('Year (optional — only ever used to show your age in the greeting, never shown as a raw date)').setMinValue(1900)),
  )

  .addSubcommand(s => s.setName('remove').setDescription('Delete your own birthday entry'))

  .addSubcommand(s => s.setName('upcoming').setDescription('Show the next 5 birthdays in this server'))

  .addSubcommand(s =>
    s.setName('config')
      .setDescription('Configure the birthday feature (Manage Server required)')
      .addChannelOption(o =>
        o.setName('channel').setDescription('Channel for daily birthday greetings').setRequired(true)
          .addChannelTypes(ChannelType.GuildText),
      )
      .addRoleOption(o => o.setName('role').setDescription("Optional role given for the day of someone's birthday"))
      .addIntegerOption(o => o.setName('hour').setDescription('UTC hour to post the greeting (0-23, default 9)').setMinValue(0).setMaxValue(23)),
  );

export default {
  data,
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;

    // ── set ────────────────────────────────────────────────────────────────
    if (sub === 'set') {
      const month = interaction.options.getInteger('month', true);
      const day   = interaction.options.getInteger('day', true);
      const year  = interaction.options.getInteger('year');

      if (!isValidCalendarDate(month, day)) {
        await interaction.reply({
          embeds: [error('Invalid date', `${MONTH_NAMES[month - 1] ?? month} ${day} does not exist.`)],
          ephemeral: true,
        });
        return;
      }

      const currentYear = new Date().getUTCFullYear();
      if (year !== null && (year < 1900 || year > currentYear)) {
        await interaction.reply({
          embeds: [error('Invalid year', `The year must be between 1900 and ${currentYear}.`)],
          ephemeral: true,
        });
        return;
      }

      Repo.setBirthday(guildId, interaction.user.id, month, day, year ?? null);

      await interaction.reply({
        embeds: [success('Birthday saved',
          `Your birthday (**${MONTH_NAMES[month - 1]} ${day}**) has been saved for this server. Running this again overwrites the previous entry.` +
          (year ? ' The year is only ever used to show your age in the greeting message — it is never shown anywhere else.' : ''),
        )],
        ephemeral: true,
      });
      return;
    }

    // ── remove ─────────────────────────────────────────────────────────────
    if (sub === 'remove') {
      const existing = Repo.getBirthday(guildId, interaction.user.id);
      if (!existing) {
        await interaction.reply({ embeds: [info('Nothing to remove', "You don't have a birthday saved.")], ephemeral: true });
        return;
      }
      Repo.removeBirthday(guildId, interaction.user.id);
      await interaction.reply({ embeds: [success('Removed', 'Your birthday has been removed.')], ephemeral: true });
      return;
    }

    // ── upcoming ───────────────────────────────────────────────────────────
    if (sub === 'upcoming') {
      const now = new Date();
      const upcoming = Repo.getUpcomingBirthdays(guildId, 5, now);

      if (upcoming.length === 0) {
        await interaction.reply({ embeds: [info('No birthdays', 'Nobody has saved a birthday yet.')], ephemeral: true });
        return;
      }

      const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
      const lines = upcoming.map(b => {
        const date = `${MONTH_NAMES[b.birth_month - 1]} ${b.birth_day}`;
        const daysUntil = Math.round((b.nextOccurrence - todayStart) / 86_400_000);
        const when = daysUntil === 0 ? '**today!**' : daysUntil === 1 ? 'tomorrow' : `in ${daysUntil} days`;
        return `**${date}** — <@${b.user_id}> (${when})`;
      });

      await interaction.reply({ embeds: [info('🎂 Upcoming Birthdays', lines.join('\n'))], ephemeral: true });
      return;
    }

    // ── config ─────────────────────────────────────────────────────────────
    if (sub === 'config') {
      if (!await requireAdmin(interaction)) return;

      const channel = interaction.options.getChannel('channel', true);
      const role    = interaction.options.getRole('role');
      const hour    = interaction.options.getInteger('hour');

      // A channel is required to configure at all, so running this command
      // is what turns the feature on — there's no separate enabled toggle
      // to forget to flip.
      Repo.setConfigValue(guildId, 'birthday_enabled', 1);
      Repo.setConfigValue(guildId, 'birthday_channel', channel.id);
      if (role)          Repo.setConfigValue(guildId, 'birthday_role', role.id);
      if (hour !== null) Repo.setConfigValue(guildId, 'birthday_ping_hour', hour);

      const cfg = Repo.getConfig(guildId);
      await interaction.reply({
        embeds: [success('Settings saved',
          `**Channel:** <#${cfg.channel}>\n` +
          `**Role:** ${cfg.role ? `<@&${cfg.role}>` : 'Not set'}\n` +
          `**Time:** ${cfg.pingHour}:00 UTC`,
        )],
        ephemeral: true,
      });
      return;
    }
  },
};
