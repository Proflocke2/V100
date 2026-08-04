/**
 * TICKETS — Enums, Interfaces, and shared type definitions.
 *
 * All strongly-typed contracts for the ticket system.
 * Imported by repository, builder, handler, and service layers.
 */

// ── Enums ─────────────────────────────────────────────────────────────────────

export enum TicketStatus {
  Open   = 'open',
  Closed = 'closed',
}

export enum PanelMode {
  Auto     = 'auto',      // system decides based on category count
  Button   = 'button',    // force buttons (falls back to dropdown if > 5)
  Dropdown = 'dropdown',  // always use StringSelectMenu
}

export enum ResolvedMode {
  Single   = 'single',    // 1 category  → one big button
  Buttons  = 'buttons',   // 2–6 cats    → up to 2 button rows (3 per row)
  Dropdown = 'dropdown',  // 7–25 cats   → 2 button rows + StringSelectMenu for rest
}

export enum CategoryColor {
  Primary   = 'primary',
  Secondary = 'secondary',
  Success   = 'success',
  Danger    = 'danger',
}

export enum FieldStyle {
  Short     = 'short',
  Paragraph = 'paragraph',
}

export enum TranscriptFormat {
  HTML = 'html',
  TXT  = 'txt',
}

export enum ActivityEvent {
  Opened    = 'opened',
  Closed    = 'closed',
  Claimed   = 'claimed',
  Unclaimed = 'unclaimed',
  UserAdded = 'user_added',
  Renamed   = 'renamed',
  AutoClosed = 'auto_closed',
}

// ── Core domain interfaces ─────────────────────────────────────────────────────

export interface TicketCategory {
  id:              number;
  panel_id:        number;
  guild_id:        string;
  /** Label shown in the select option and used as fallback button text. */
  label:           string;
  /**
   * Custom button label.
   * Falls back to `label` when null.
   * E.g. "Open Ticket", "Contact Support"
   */
  button_text:     string | null;
  /** Optional emoji shown on the button/select option. */
  emoji:           string | null;
  /** Discord button style used when rendered as a button. */
  color:           CategoryColor;
  /** ID of the Discord Category channel where ticket channels are created. */
  category_id:     string;
  /** Role that gets exclusive ViewChannel access to tickets in this category. */
  support_role_id: string | null;
  /** First message posted in the new ticket channel. Supports {user}, {channel}, {category}. */
  welcome_message: string | null;
  position:        number;
}

export interface PanelConfig {
  id:          number;
  guild_id:    string;
  title:       string;
  description: string | null;
  color:       string;
  mode:        PanelMode;
  image:       string | null;
  thumbnail:   string | null;
  footer:      string | null;
  content:     string | null;
  channel_id:  string | null;
  message_id:  string | null;
  created_at:  number;
}

export interface ModalField {
  id:          number;
  panel_id:    number;
  position:    number;
  label:       string;       // max 45 chars (Discord limit)
  placeholder: string | null;
  style:       FieldStyle;
  required:    boolean;
  min_length:  number;
  max_length:  number;
}

export interface MultiPanelConfig {
  id:          number;
  guild_id:    string;
  name:        string;       // internal name (staff only)
  title:       string;
  description: string | null;
  color:       string;
  image:       string | null;   // large embed image URL
  thumbnail:   string | null;   // small corner thumbnail URL
  footer:      string | null;   // embed footer text
  content:     string | null;   // plain text above the embed
  panel_ids:   string;       // JSON-serialised number[]  (max 5)
  mode:        'dropdown' | 'button'; // how panels are picked from the multi-panel message
  channel_id:  string | null;
  message_id:  string | null;
  created_at:  number;
}

export interface TicketRecord {
  id:               number;
  guild_id:         string;
  channel_id:       string;
  user_id:          string;
  panel_id:         number | null;
  category_id:      number | null;
  number:           number;
  status:           TicketStatus;
  claimed_by:       string | null;
  close_reason:     string | null;
  last_activity_at: number;   // unix timestamp — used for autoclose
  created_at:       number;
  closed_at:        number | null;
}

export interface TicketSystemSettings {
  guild_id:              string;
  log_channel_id:        string | null;
  archive_channel_id:    string | null;   // channel where archived tickets go
  transcript_format:     TranscriptFormat;
  cooldown_seconds:      number;
  max_open:              number;
  name_pattern:          string;   // {username} and {id} placeholders
  dm_on_close:           boolean;
  remove_branding:       boolean;  // Premium: hide footer branding
  // Autoclose
  autoclose_enabled:     boolean;
  autoclose_hours:       number;   // hours of inactivity before auto-close
  // Support hours (UTC)
  support_hours_enabled: boolean;
  support_hours_start:   string | null;   // "HH:MM"
  support_hours_end:     string | null;   // "HH:MM"
  // Exit survey
  survey_enabled:        boolean;
  // Staff access — see modules/tickets/handler.ts isStaff()
  admin_role_id:          string | null;   // bypasses staff checks everywhere, same as Administrator perm
  fallback_staff_role_id: string | null;   // used when a ticket's category has no support_role_id of its own
}

export interface TicketTag {
  id:         number;
  guild_id:   string;
  name:       string;      // unique per guild, used as command alias
  content:    string;      // markdown content sent when tag is used
  created_by: string;      // userId
  created_at: number;
}

export interface TicketActivity {
  id:         number;
  guild_id:   string;
  ticket_id:  number;
  user_id:    string;
  event:      ActivityEvent;
  created_at: number;
}

export interface SurveyResponse {
  id:           number;
  ticket_id:    number;
  guild_id:     string;
  user_id:      string;
  rating:       number;  // 1-5
  feedback:     string | null;
  submitted_at: number;
}

export interface FormAnswer {
  label: string;
  value: string;
}

export interface OpenResult {
  ok:         boolean;
  channelId?: string;
  ticketId?:  number;
  reason?:    string;
}

export interface CooldownResult {
  ok:          boolean;
  remaining?:  number;
  openCount?:  number;
  outsideHours?: boolean;
  nextOpen?:   string;  // HH:MM UTC when support hours open
}
