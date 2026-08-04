/**
 * modules/birthday/service.ts
 *
 * Public entry point — runBirthdayTick(guilds) gets called once from a
 * scheduler (handlers/schedulers.ts, every 15-30 min, see startBirthdayScheduler).
 *
 * Does two things per active guild, every tick:
 *   1. Removes birthday_role from anyone who still has it but wasn't
 *      greeted TODAY — i.e. it's left over from a previous day. This
 *      doubles as the "take the role away the next day" cleanup, so no
 *      separate job is needed (this is a deliberate simplification — see
 *      the caveat comment further down about what it means for manually
 *      assigned copies of that role).
 *   2. Greets today's birthdays once the configured hour has passed.
 */

import { EmbedBuilder, Guild, TextChannel, GuildMember } from 'discord.js';
import * as Repo from './repository';
import { dayKey, isGreetingDue } from './dateUtils';

/** Called only from greetUser(), which only ever fires ON the birthday itself — so this is always simply "current year minus birth year", no "hasn't had it yet this year" branch needed. */
function calculateAge(birthYear: number, now: Date): number {
  return now.getUTCFullYear() - birthYear;
}

async function greetUser(member: GuildMember, birthday: Repo.Birthday, channel: TextChannel, roleId: string | null): Promise<void> {
  let ageLine = '';
  if (birthday.birth_year) {
    // birth_year is ONLY ever surfaced as "turns N years old" here — never as a
    // raw date, and never anywhere else (not in /birthday upcoming, not in
    // any log). Someone might be fine sharing the day/month publicly but
    // not their exact age or birth year, so we don't assume otherwise.
    const age = calculateAge(birthday.birth_year, new Date());
    ageLine = ` and turns **${age}** years old`;
  }

  const embed = new EmbedBuilder()
    .setColor('#ff6b9d')
    .setTitle('🎉 Happy Birthday!')
    .setDescription(`Happy Birthday, ${member}${ageLine}! 🎂`)
    .setTimestamp();

  await channel.send({ content: `${member}`, embeds: [embed] }).catch(() => {});

  if (roleId) {
    try {
      await member.roles.add(roleId);
    } catch (err) {
      // Missing permissions, role above the bot's highest role, etc. — skip
      // just this user's role, the greeting itself already went out above.
      console.error(`[Birthday] Could not add role to ${member.id} in ${member.guild.id}:`, err);
    }
  }
}

/**
 * Strips birthday_role from anyone who has it but whose last_greeted_key
 * isn't today — i.e. it was given on some earlier day. CAVEAT: this can't
 * distinguish "the bot gave them this role for their birthday" from "an
 * admin happened to assign the same role manually for an unrelated reason"
 * — anyone wearing this role without today being their (recorded) birthday
 * loses it on the next tick. Keep birthday_role a role that's ONLY ever
 * used for this feature to avoid surprises.
 */
async function cleanupExpiredRole(guild: Guild, roleId: string, today: string): Promise<void> {
  const role = await guild.roles.fetch(roleId).catch(() => null);
  if (!role) return;

  for (const [memberId, member] of role.members) {
    const bday = Repo.getBirthday(guild.id, memberId);
    if (bday && bday.last_greeted_key === today) continue; // legitimately greeted today — keep it

    try {
      await member.roles.remove(roleId);
    } catch (err) {
      console.error(`[Birthday] Could not remove role from ${memberId} in ${guild.id}:`, err);
    }
  }
}

export async function runBirthdayTick(guilds: Map<string, Guild>): Promise<void> {
  const now = new Date();
  const today = dayKey(now);

  for (const guildId of Repo.getActiveGuildIds()) {
    const guild = guilds.get(guildId);
    if (!guild) continue;

    const cfg = Repo.getConfig(guildId);
    // getActiveGuildIds() already filtered on birthday_enabled=1, but
    // re-check here too — cheap, and keeps this function safe to call
    // standalone/from tests without relying on the caller's filtering.
    if (!cfg.enabled) continue;

    try {
      if (cfg.role) {
        await cleanupExpiredRole(guild, cfg.role, today);
      }

      if (!cfg.channel) continue;
      const channel = guild.channels.cache.get(cfg.channel) as TextChannel | undefined;
      if (!channel || !channel.isTextBased()) continue;

      const todaysBirthdays = Repo.getTodaysBirthdays(guildId, today);
      for (const bday of todaysBirthdays) {
        if (!isGreetingDue(cfg.pingHour, bday.last_greeted_key, now)) continue;

        const member = await guild.members.fetch(bday.user_id).catch(() => null);
        if (!member) {
          // They're no longer in the guild — mark greeted anyway so this
          // row doesn't get re-evaluated (and keep failing to fetch) every
          // 15-30 minutes for the rest of the day.
          Repo.markGreeted(guildId, bday.user_id, today);
          continue;
        }

        await greetUser(member, bday, channel, cfg.role);
        Repo.markGreeted(guildId, bday.user_id, today);
      }
    } catch (err) {
      console.error(`[Birthday] Tick failed for guild ${guildId}:`, err);
    }
  }
}
