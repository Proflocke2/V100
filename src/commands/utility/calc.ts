import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { executeCalc } from '../../modules/calc/service';

export default {
  data: new SlashCommandBuilder()
    .setName('calc')
    .setDescription('Calculate a trade between two people, with a shared confirm button for both sides')
    .addUserOption(o => o.setName('buyer').setDescription('The buyer').setRequired(true))
    .addUserOption(o => o.setName('seller').setDescription('The seller').setRequired(true))
    .addStringOption(o => o.setName('item').setDescription('What is being traded').setRequired(true))
    .addIntegerOption(o => o.setName('quantity').setDescription('How many').setRequired(true).setMinValue(1))
    .addNumberOption(o => o.setName('price').setDescription('Price per unit').setRequired(true).setMinValue(0)),

  async execute(interaction: ChatInputCommandInteraction) {
    await executeCalc(interaction);
  },
};
