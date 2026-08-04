# 🎉 Big Update: New Menu System

We rebuilt how you use the bot. Instead of memorizing dozens of slash commands, **everything now lives in a handful of menus** with buttons and dropdowns. Same features, far easier to find.

## The commands you'll use

Just **5 menus** cover almost everything:

**🏠 `/menu`** — your member hub
Economy, levels, tickets, birthdays, polls, reminders, feedback and more. Pick a category, pick an entry, done.

**🎮 `/games`** — the game launcher
Every game sorted into Solo, Duels, Party and Betting. No more remembering each game's name.

**🛡️ `/staff`** — staff tools *(team only)*
Moderation, member management, records, raid tools and ticket handling. You only see what you're allowed to use.

**⚙️ `/config`** — server setup *(admin only)*
Security, tickets, welcome, economy, backups and the permission system.

**❓ `/help`** — quick reference.

Plus three commands that need a real file upload (Discord can't do uploads through buttons): **`/bot-backup`**, **`/server-backup`** and **`/bot-customize`** (avatar/banner).

## How it works

1. Type `/menu` (or `/games`, `/staff`, `/config`)
2. Choose a category from the dropdown — each one explains itself
3. Choose an entry — you'll see what it does and what info it needs
4. Fill in the fields (buttons, dropdowns, or a small text box) and hit **Run**

Every screen has a short description, so you never have to guess. Sessions are private to you and expire after 15 minutes of inactivity.

## Nothing was removed

All features from before are still here — **260+ actions**, every single one reachable through the menus. We only changed how you get to them. Tickets, giveaways, embeds, moderation, games... it all works exactly as before, you just pick it from a menu now.

## For admins: the new permission system

Under **`/config → Permissions`** you can control access far more precisely than before:

- **Access roles** — set which roles count as Staff and which count as Admin. (If you set nothing, it falls back to Discord's *Moderate Members* / *Manage Server* permissions.)
- **Fine-grained overrides** — allow, block, or restrict any command (or even a single subcommand) to specific roles. For example: give your whole mod team the moderation tools, but limit mass-ban to head mods only.

The server owner and anyone with Administrator always have full access. Permissions are checked live on every action, so role changes take effect immediately.

## Why we did this

Feedback was clear: the bot could do a lot, but the sheer number of commands was overwhelming. This update keeps every capability while making the whole thing approachable — new members can explore by clicking instead of reading a command list.

**Try `/menu` now and have a look around.** Questions? Ping the team. 💬
