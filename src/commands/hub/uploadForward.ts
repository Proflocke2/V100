// src/commands/hub/uploadForward.ts — shared helper for the upload delegation commands
import { ChatInputCommandInteraction } from 'discord.js';

/**
 * Runs a specific subcommand of a loaded command from a flat slash command by
 * overriding options.getSubcommand()/getSubcommandGroup(). Every other option
 * accessor (getAttachment, getString, …) passes straight through, so the
 * target execute() behaves exactly as it always has.
 */
export function forwardWithSubcommand(
  interaction: ChatInputCommandInteraction,
  subcommand: string,
): ChatInputCommandInteraction {
  const proxy = new Proxy(interaction, {
    get(target, prop) {
      if (prop === 'options') {
        const opts = Reflect.get(target, 'options', target) as ChatInputCommandInteraction['options'];
        return new Proxy(opts, {
          get(optTarget, optProp) {
            if (optProp === 'getSubcommand') return () => subcommand;
            if (optProp === 'getSubcommandGroup') return () => null;
            const v = Reflect.get(optTarget, optProp, optTarget);
            return typeof v === 'function' ? v.bind(optTarget) : v;
          },
        });
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return proxy as ChatInputCommandInteraction;
}
