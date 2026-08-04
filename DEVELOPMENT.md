# Development Guide

This document provides guidance for developers working on MultiBot V1.

## Project Structure Overview

The project is organized into logical modules:

- **`src/commands/`** - All slash command implementations organized by category
- **`src/database/`** - Database initialization and helper functions
- **`src/events/`** - Discord event handlers (ready, messageCreate, etc.)
- **`src/handlers/`** - Command/event loading, deployment, and schedulers
- **`src/services/`** - Core business logic (GameManager, VerificationService, etc.)
- **`src/economy/`** - Economy/currency system implementation
- **`src/stats/`** - Statistics and tracking systems
- **`src/utils/`** - Helper functions, types, and utilities

## Setting Up Your Development Environment

### Required Tools

- Node.js 16.9.0+
- npm or yarn
- Git
- A code editor (VS Code recommended)

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/MultiBotV1.git
cd MultiBotV1

# Install dependancies
npm install

# Create .env file from template
cp .env.example .env

# Edit .env with your credentials
# BOT_TOKEN: Get from Discord Developer Portal
# CLIENT_ID: Your bot's application ID
```

### Development Workflow

```bash
# Start development server with hot reload
npm run dev

# Build TypeScript to JavaScript
npm run build

# Run compiled bot
npm start
```

## Creating New Commands

### Command Structure

Commands follow a standard pattern:

```typescript
import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { getGuild } from '../../database/db';
import { getLocalized, Language } from '../../utils/localization';

export default {
  data: new SlashCommandBuilder()
    .setName('commandname')
    .setDescription('Brief description')
    .addStringOption(option => option
      .setName('parameter')
      .setDescription('Parameter description')
      .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    // Get user's guild language
    const guild = getGuild(interaction.guildId!);
    const language = (guild.language || 'en') as Language;

    // Your command logic here
    const message = getLocalized('key.for.message', language);
    await interaction.reply(message);
  }
};
```

### File Placement

1. Place command file in appropriate subdirectory under `src/commands/`
2. Name the file lowercase with `.ts` extension
3. The command handler will automatically load it

### Using Localization

Always use the localization system for user-facing strings:

```typescript
import { getLocalized, Language } from '../../utils/localization';

const message = getLocalized('key.name', language);

// With variables
const withVars = getLocalized('key.with', language, { 
  username: interaction.user.username 
});
```

## Adding New Languages

1. Edit `src/utils/localization.ts`
2. Add language code to `Language` type
3. Add strings for the new language to the `strings` object
4. Update language choices in `/language` command
5. Update `getLanguageName()` function

## Database Schema

Tables are initialized in `src/database/db.ts`. Key tables:

- **guilds** - Server configuration (language, settings, etc.)
- **users** - User XP, levels, and stats
- **tickets** - Ticket system data
- **giveaways** - Giveaway tracking
- **applications** - Custom application forms
- **verification_config** - Verification system settings

To add new tables:

1. Add SQL CREATE TABLE statement in `src/database/db.ts`
2. Create helper functions if needed
3. Document the schema

## Code Style Guidelines

### Naming Conventions

- **Commands**: lowercase with hyphens for multiple words (`/ping-pong`)
- **Files**: kebab-case for filenames (`my-command.ts`)
- **Types/Interfaces**: PascalCase (`GuildConfig`)
- **Variables/Functions**: camelCase (`getUserBalance`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_XP_PER_MESSAGE`)

### Formatting

- Use 2-space indentation
- Use `const` by default, `let` when needed, avoid `var`
- Always use type annotations for function parameters
- Use `async/await` instead of `.then()` chains

### Comments

- English language comments only
- Explain *why*, not *what* the code does
- Keep comments concise and practical
- Comment complex logic sections only

Example of good comments:
```typescript
// Rate limit XP gains to prevent farming (1 message per 60 seconds)
if (Date.now() - user.last_xp < 60000) return;
```

## Testing Locally

### Testing with One Guild

Set `GUILD_ID` in `.env` to test slash command deployment to one server only (instant):

```env
BOT_TOKEN=your_token
CLIENT_ID=your_client_id
GUILD_ID=your_test_server_id
```

This deploys commands to that guild immediately instead of globally (which takes ~1 hour).

### Common Testing Scenarios

1. **New command not appearing**: Restart bot after adding command file
2. **Database errors**: Delete `bot.db` and restart (data will reset)
3. **Permission issues**: Check bot role permissions in server
4. **Type errors**: Run `npm run build` to verify TypeScript compilation

## Debugging

### Enable Debug Logging

The bot uses console methods. For detailed debugging:

```typescript
console.log('[Module] Message:', variable);
console.warn('[Module] Warning:', error);
console.error('[Module] Error:', error);
```

### Inspect Database

Use SQLite tools to inspect `bot.db`:

```bash
# Using sqlite3 CLI
sqlite3 bot.db "SELECT * FROM guilds LIMIT 5;"
```

### Discord.js Debugging

Enable discord.js debugging (add to index.ts):

```typescript
client.on('debug', (msg) => console.log(`[Discord.js] ${msg}`));
client.on('warn', (msg) => console.warn(`[Discord.js] ${msg}`));
```

## Performance Considerations

1. **Database Queries**: Cache frequently accessed guild configs
2. **Event Handlers**: Avoid heavy processing in messageCreate events
3. **Embeds**: Limit to 25 fields per embed
4. **Requests**: Use timeouts for external API calls
5. **Memory**: Monitor bot memory usage for large guilds

## Deployment

### Building for Production

```bash
# Install dependancies
npm install --production

# Build TypeScript
npm run build

# Run bot
npm start
```

### Environment Variables

Ensure these are set in production:
- `BOT_TOKEN` - Your bot token (keep secret!)
- `CLIENT_ID` - Application ID
- `NODE_ENV` - Set to `production` (optional)

### Hosting Options

MultiBot V1 works on:
- VPS (Linode, DigitalOcean, AWS)
- Home server/Raspberry Pi
- Container platforms (Docker, Kubernetes)
- Free tier services (limited capability)

## Troubleshooting Development

### Port Already in Use
If you get port-in-use errors, another bot instance is running. Kill it:
```bash
lsof -i :PORT_NUMBER
kill -9 PID
```

### Node Modules Issues
If you have weird module errors:
```bash
rm -rf node_modules package-lock.json
npm install
```

### TypeScript Not Compiling
Check for type errors:
```bash
npm run build
```

## Contributing

When submitting changes:

1. Follow code style guidelines
2. Test your changes locally
3. Update documentation if needed
4. Keep commits descriptive
5. Add localization strings for new user-facing text

## Resources

- [discord.js Documentation](https://discord.js.org/)
- [Discord API Reference](https://discord.com/developers/docs/intro)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Better SQLite3 Documentation](https://github.com/WiseLibs/better-sqlite3)

## Questions?

Open an issue on GitHub or check existing issues for answers to common problems.

---

Happy coding! 🎉
