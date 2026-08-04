<div align="center">

# MultiBotV2

**An all-in-one Discord bot — built with TypeScript & discord.js v14**

[![Invite](https://img.shields.io/badge/Invite%20Bot-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.com/oauth2/authorize?client_id=1498679223223844977)

---

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![discord.js](https://img.shields.io/badge/discord.js-v14-5865F2?style=flat-square&logo=discord&logoColor=white)](https://discord.js.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![SQLite](https://img.shields.io/badge/SQLite-libsql-003B57?style=flat-square&logo=sqlite&logoColor=white)](https://github.com/tursodatabase/libsql)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)
[![Commands](https://img.shields.io/badge/Commands-86-blueviolet?style=flat-square)]()
[![Language](https://img.shields.io/badge/Language-English-informational?style=flat-square)]()

</div>

---

## Table of Contents

- [Features](#features)
- [Commands](#commands)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Security](#security)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Localization](#localization)
- [Legal Notice](#legal-notice)

---

## Features

### 🎫 Ticket System
A full support-ticket system with panels and multi-panels. Members open a ticket
with one click, staff get a private channel, and everything is archived as a
transcript automatically.

- Multi-panel with up to 5 panels / 25 categories combined into one message
- Custom form questions per panel or per category, asked before a ticket opens
- Auto-close for inactive tickets, support-hour restrictions, sticky branding
- Transcript export (HTML/TXT), archive channel, exit survey (1-5 stars)
- Saved-response tags, reusable ticket-type templates, staff performance stats

### 🛡️ Moderation & AutoMod
A complete moderation toolkit with automatic escalation.

- Ban, kick, timeout, and warnings with configurable auto-escalation
- AutoMod: spam, bad words, invite links, phishing links, caps-lock, regex filters
- Mod-log for deleted/edited messages and member joins/leaves
- Channel lock/unlock, slowmode (server-wide or per-user), bulk message purge
- Mod notes and full infraction history per member

### 🛡️ Anti-Raid & Security
Layered protection against raids and compromised accounts, grouped under `/security`:

- **Anti-Nuke** — protects against a compromised staff account mass-deleting channels/roles
- **Anti-Raid** — detects join waves and reacts automatically
- **Auto-Defend** — the bot picks an automatic action per attack type
- **Ultra-Mode** — instant, score-based defense for suspicious new joiners
- **Inactivity-Kick** — removes members who never became active
- `/raid-tools` and `/attacksim` let you safely *test* your setup before you need it

### 🎭 Reaction & Button Roles
Self-assignable roles by clicking a button — no external bot needed.

### 📊 Level & XP System
Message-based XP with a cooldown, rank cards, a leaderboard, and role rewards
for reaching specific levels.

### 👋 Welcome System
Custom welcome cards (image, message, background), a private welcome DM, leave
messages, auto-roles, and alt-account detection. `/simwelcome` lets you preview
everything without a real member joining.

### 🪙 Economy & Casino
A virtual-coin system: slots, blackjack, a lottery, a shop, PvP coin duels, and
a mandatory disclaimer + cooldown before every gambling command.

### 🎮 Mini-Games
20+ games: Tic-Tac-Toe, Connect Four, Chess, Battleship, UNO, Yahtzee,
Mastermind, Hangman, Minesweeper, Wordle, trivia, party games, and more —
against the AI or against another player.

### 📝 Applications
A fully in-Discord application system (e.g. "apply for staff") — members
answer questions through modals, staff accept or decline with a reason.

### 👥 Staff Activity Tracking
Tracks how active your staff team is: closed tickets and registered giveaway
sponsors per member, a leaderboard, and an optional friendly weekly-goal
reminder. Everything is per-feature toggleable and disabled by default except
ticket counting.

### 🔧 Utility
Giveaways with auto-draw, polls, reminders, custom embeds, webhook management,
versioned server backups, live stats channels, per-server bot branding
(nickname/avatar/banner), and more.

---

## Commands

MultiBotV2 ships **83 top-level commands**. Many bundle several related
actions as subcommands (e.g. `/security antinuke setup`) to stay well under
Discord's 100-command limit while keeping the command surface organized.

For a full, plain-English explanation of every single command and
subcommand, run **`/help`** in Discord — it sends you a `.txt` guide written
at an easy reading level. A short table of the main categories:

| Category | Example commands |
|---|---|
| 🎫 Tickets | `/panel`, `/multipanel`, `/ticket`, `/ticket-types`, `/ticket-content`, `/settings`, `/ticketstats` |
| 🛡️ Moderation | `/member`, `/ban`, `/timeout`, `/warnings`, `/restrict`, `/mass-action`, `/records`, `/automod` |
| 🛡️ Security | `/security`, `/raid-tools`, `/attacksim` |
| 📊 Level & XP | `/level` |
| 👋 Welcome | `/welcome`, `/simwelcome` |
| 🪙 Economy | `/daily`, `/eco-stats`, `/pay`, `/shop`, `/blackjack`, `/slots`, `/eco-config`, `/eco-admin` |
| 🎮 Games | `/play`, `/challenge`, `/rps`, `/chess`, `/uno`, `/wordle`, `/quiz`, and 15+ more |
| 👥 Staff | `/team-activity` |
| 🔧 Utility | `/giveaway`, `/poll`, `/remind`, `/embed`, `/backup`, `/bot-customize`, `/stats`, `/webhook`, `/data`, `/help` |

---

## Quick Start

### Requirements

- **Node.js** v20 or higher
- A **Discord bot token** — [Discord Developer Portal](https://discord.com/developers/applications)
- Gateway intents: `Guilds` · `GuildMembers` · `GuildMessages` · `MessageContent`

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/Proflocke2/MultiDiscordBotV1.git
cd MultiDiscordBotV1

# 2. Install dependencies
npm install

# 3. Set environment variables
cp .env.example .env
# open .env and fill in BOT_TOKEN, CLIENT_ID, and (optionally) BOT_OWNER_ID

# 4. Development mode (hot-reload)
npm run dev

# 5. Production
npm run build
npm start
```

Slash commands are registered automatically on startup.

### Invite the bot

**[➜ Add the bot to your server](https://discord.com/oauth2/authorize?client_id=1498679223223844977)**

---

## Configuration

### Environment variables

```env
BOT_TOKEN=your_discord_bot_token
CLIENT_ID=your_application_client_id
GUILD_ID=your_guild_id_here          # optional — instant per-guild command deploy
BOT_OWNER_ID=your_discord_user_id    # optional — grants owner-only access to /deploy
```

See `.env.example` for the full list, including the optional GitHub DB-backup
sync used on Render's free tier.

### Economy settings

Edit `src/economy/config/EconomyConfig.ts`:

```typescript
startingBalance:  1000,     // starting coins for new users
minBet:           1,        // minimum bet
maxBet:           Infinity, // maximum bet (set a number to cap it)
sessionLimit:     20,       // max games per 30 minutes
challengeTimeout: 60,       // seconds to accept a PvP challenge
```

### Staff Activity Tracking

Nothing to edit in code — everything is configured per server via
`/team-activity config-tickets`, `config-sponsors`, `config-leaderboard`, and
`config-quota`. See `/help` for details.

---

## Security

This bot has been through several security-hardening passes:

| Measure | Details |
|---|---|
| **SQL-injection protection** | `setGuildValue()` uses a column-name allowlist for every guild config write |
| **Runtime permission guards** | Admin commands check permissions server-side, not just via Discord's UI |
| **URL validation** | HTTPS-only, no local/private IPs (SSRF protection) |
| **GDPR compliance** | `/data info` / `/data delete` cover every table that stores personal data |
| **No error leaking** | Stack traces are logged internally, never shown to users |
| **Owner-gated destructive actions** | `/deploy` and other high-impact actions check `BOT_OWNER_ID` |

---

## Tech Stack

| Technology | Used for |
|---|---|
| [TypeScript 5.5](https://www.typescriptlang.org/) | Type-safe development |
| [discord.js v14](https://discord.js.org/) | Discord API |
| [libsql / node-sqlite3-wasm](https://github.com/tursodatabase/libsql) | SQLite database |
| [@napi-rs/canvas](https://github.com/Brooooooklyn/canvas) | Rank cards & welcome-card image generation |
| [axios](https://axios-http.com/) | HTTP requests |
| [dotenv](https://github.com/motdotla/dotenv) | Environment variables |

---

## Project Structure

```
src/
├── commands/            # One file per top-level slash command, grouped by category
│   ├── application/
│   ├── economy/
│   ├── games/
│   ├── moderation/      # Dispatcher commands (e.g. security.ts, restrict.ts) live here
│   ├── tickets/
│   ├── utility/
│   └── welcome/
├── merged/
│   ├── mergeUtils.ts    # wrapAsSubcommand() / copyAsSubcommandGroup() helpers
│   └── impl/            # Original command logic, re-exposed as subcommands by the dispatchers
├── modules/
│   ├── tickets/         # builder, handler, repository, service, transcript, types
│   ├── moderation/      # antiRaid, modLog
│   ├── staffActivity/   # repository, service, weekUtils — staff tracking extension
│   ├── canvas/          # rankCard, leaderboardCard
│   ├── welcome/         # card, repository, service
│   └── backup/          # migrations, repository, service
├── docs/
│   └── commandGuideText.ts  # source text for /help
├── economy/              # config, cooldown, db, engine, guards, handlers
├── events/                # ready, interactionCreate, messageCreate, guildMemberAdd, …
├── handlers/              # commandHandler, deploy, eventHandler, schedulers
├── i18n/                  # commandDescriptions.ts + message localization
├── services/              # GameManager, VerificationService, WebhookService, …
├── database/              # db.ts — SQLite connection & guild config
└── utils/                 # embeds, guards, rateLimiter, validators, helpers
```

---

## Localization

**The bot currently runs English-only.** Every command, menu, and message is
in English, regardless of server region. This is intentional for now —
`/language` exists in the codebase but is disabled (see
`src/commands/utility/language.ts.disabled`) while the translation pass is
still in progress across the rest of the bot.

Under the hood, an EN/DE/FR/RU localization system already exists and is
partially wired up (English is always complete; German/French/Russian are
filled in for a growing subset of features, with automatic fallback to
English wherever a translation is missing). Re-enabling `/language` once the
remaining modules are fully translated is just a matter of renaming the file
back to `language.ts` and redeploying — no other code changes needed.

---

## Legal Notice

- All economy features use **virtual coins** with no real-world value — they
  cannot be exchanged for money, goods, or services.
- Whoever runs this bot is **solely responsible** for complying with all
  applicable laws (GDPR, youth protection, gambling regulations, etc.).
- The gambling disclaimer and session-limit system are technical safeguards,
  not a licensed compliance solution.
- The author accepts **no liability** for any damages, legal violations, or
  losses of any kind arising from running this bot. Use is entirely at your
  own risk.
- This software is provided **"as is"**, without warranty of any kind,
  express or implied.

### ⚠️ Render Free Tier — Data Loss Risk

Render's free tier uses an **ephemeral filesystem**: `bot.db` is wiped on every redeploy and after ~15 minutes of inactivity. The GitHub DB-sync has been removed for GDPR reasons. **Before any redeploy, export a backup with `/bot-backup export`.** For production, upgrade to a Render plan with Persistent Disk or self-host on a VPS.

### Discord Bot Verification

- Above **75 servers:** Discord requires 2FA for privileged intent access.
- Above **100 servers:** Formal app verification is required. Justification needed for `MessageContent` (AutoMod word filter), `GuildPresences` (online member counter), and `GuildMembers` (welcome system, raid detection). Plan this before scaling.

### Legal documents

| Document | Purpose |
|----------|---------|
| [Privacy Policy](docs/privacy.html) | Data categories, legal basis, GDPR rights (Art. 15–21), age 16+, gambling notice |
| [DPA / AVV Template](docs/dpa.html) | Art. 28 GDPR template — required when operating for third-party servers |

> **Before going live:** set `DOCS_URL` in your Render environment to the URL where `docs/` is hosted. See `docs/README.md` for free hosting options (GitHub Pages, Netlify, Vercel).

---

## License

This project is licensed under the **MIT License** — see [LICENSE](LICENSE).

---

<div align="center">

**[➜ Invite the bot](https://discord.com/oauth2/authorize?client_id=1498679223223844977)**

Built with ❤️ in TypeScript

</div>
