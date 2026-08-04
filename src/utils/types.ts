import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  Client,
  Collection,
} from 'discord.js';

export interface Command {
  data: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder | Omit<SlashCommandBuilder, 'addSubcommand' | 'addSubcommandGroup'>;
  execute: (interaction: ChatInputCommandInteraction, client: BotClient) => Promise<void>;
}

export interface BotClient extends Client {
  commands: Collection<string, Command>;
}

export interface GuildRow {
  id: string;
  mod_log_channel: string | null;
  welcome_channel: string | null;
  welcome_message: string | null;
  welcome_embed: number;
  welcome_color: string;
  welcome_role: string | null;
  automod_enabled: number;
  automod_antilink: number;
  automod_antispam: number;
  automod_badwords: string;
  log_channel: string | null;
  level_enabled: number;
  level_channel: string | null;
  level_roles: string;
  language: string;
  embed_color: string;
}

export interface TicketRow {
  id: number;
  guild_id: string;
  channel_id: string;
  user_id: string;
  panel_id: number | null;
  number: number;
  status: string;
  claimed_by: string | null;
  created_at: number;
  closed_at: number | null;
}

export interface PanelRow {
  id: number;
  guild_id: string;
  name: string;
  title: string;
  description: string | null;
  color: string;
  emoji: string;
  button_text: string;
  category_id: string | null;
  support_roles: string;
  message_id: string | null;
  channel_id: string | null;
}

export interface UserRow {
  id: string;
  guild_id: string;
  xp: number;
  level: number;
  messages: number;
  last_xp: number;
}

export interface WarnRow {
  id: number;
  guild_id: string;
  user_id: string;
  moderator_id: string;
  reason: string;
  created_at: number;
}

export interface ApplicationRow {
  id: number;
  guild_id: string;
  name: string;
  description: string | null;
  questions: string;
  accept_role: string | null;
  review_channel: string | null;
  dm_message: string | null;
  button_label: string | null;
  active: number;
  max_concurrent: number;
  reapply_cooldown_days: number;
  accepted_channel: string | null;
  denied_channel: string | null;
}

export interface GiveawayRow {
  id: number;
  guild_id: string;
  channel_id: string;
  message_id: string | null;
  prize: string;
  winners: number;
  host_id: string;
  ends_at: number;
  ended: number;
  participants: string;
  winner_ids: string;
}
