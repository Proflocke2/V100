/**
 * VERIFY HANDLER
 * handles verify button clicks and captcha modal submissions
 */

import {
  ButtonInteraction,
  ModalSubmitInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
} from 'discord.js';
import { BotClient } from '../utils/types';
import { error, success } from '../utils/embeds';
import { VerificationService } from '../services/verificationService';
import { CaptchaProvider } from '../services/captchaProvider';
import { getGuild } from '../database/db';
import { getLocalized, Language } from '../utils/localization';

/**
 * Handle verify button click - shows captcha to user
 * customId: verify_button
 */
export async function handleVerifyButton(
  interaction: ButtonInteraction,
  client: BotClient
): Promise<void> {
  try {
    const userId = interaction.user.id;
    const guildId = interaction.guildId!;

    // get config
    const config = VerificationService.getConfig(guildId);
    if (!config || !config.enabled) {
      await interaction.reply({
        embeds: [error('Verification not setup', 'Ask an admin to run `/v-setup` first')],
        ephemeral: true,
      });
      return;
    }

    if (!config.verifiedRoleId) {
      await interaction.reply({
        embeds: [error('Configuration error', 'Verified role not configured. An admin needs to run `/v-setup configure` first.')],
        ephemeral: true,
      });
      return;
    }

    // check if user already has verified role
    const member = interaction.member as any;
    if (member?.roles?.cache?.has(config.verifiedRoleId)) {
      await interaction.reply({
        embeds: [success('Already verified', 'You are already verified ✓')],
        ephemeral: true,
      });
      return;
    }

    // check cooldown to prevent spam
    const cooldownLeft = VerificationService.getCooldownRemaining(userId);
    if (cooldownLeft > 0) {
      await interaction.reply({
        embeds: [error('Slow down!', `Please wait ${cooldownLeft}s before trying again`)],
        ephemeral: true,
      });
      
      // log cooldown hit
      await VerificationService.logAction(
        interaction.guild!,
        interaction.user,
        'cooldown',
        `User hit cooldown (${cooldownLeft}s remaining)`
      );
      return;
    }

    // set the cooldown so they cant spam
    VerificationService.setCooldown(userId);

    // generate captcha
    const captcha = await CaptchaProvider.generate();
    
    // store the session
    VerificationService.createSession(userId, captcha.code);

    // log start of verification
    await VerificationService.logAction(
      interaction.guild!,
      interaction.user,
      'started',
      'User started verification process'
    );

    // build the captcha embed
    const lang = (getGuild(interaction.guildId!).language || 'en') as Language;
    const embed = new EmbedBuilder()
      .setTitle(getLocalized('verify.captcha_title', lang))
      .setDescription([
        '**Please solve the CAPTCHA below to verify yourself.**',
        '',
        '1️⃣ Look at the image carefully',
        '2️⃣ Click the **Submit Code** button',
        '3️⃣ Type the code you see',
        '',
        `⏱️ This captcha expires in **2 minutes**`,
        `🚫 You have **3 attempts**`,
      ].join('\n'))
      .setColor('#5865f2')
      .setImage('attachment://captcha.png')
      .setFooter({ text: 'Case insensitive - 0/O and 1/I are not used' });

    // submit button
    const submitBtn = {
      type: 1, // ActionRow
      components: [
        {
          type: 2, // Button
          style: 1, // Primary
          label: 'Submit Code',
          custom_id: 'verify_submit',
          emoji: { name: '✅' },
        },
      ],
    };

    await interaction.reply({
      embeds: [embed],
      files: [captcha.attachment],
      components: [submitBtn as any],
      ephemeral: true,
    });
  } catch (err) {
    console.error('[Verify Button] error:', err);
    await interaction.reply({
      embeds: [error('Something went wrong', 'Please try again later')],
      ephemeral: true,
    }).catch(() => {});
  }
}

/**
 * Handle the "Submit Code" button - opens the modal
 * customId: verify_submit
 */
export async function handleVerifySubmitButton(
  interaction: ButtonInteraction
): Promise<void> {
  try {
    // check if session exists
    const session = VerificationService.getSession(interaction.user.id);
    if (!session) {
      await interaction.reply({
        embeds: [error('Captcha expired', 'Please click "Verify" again to get a new code')],
        ephemeral: true,
      });
      return;
    }

    // build the modal
    const modalLang = (getGuild(interaction.guildId!).language || 'en') as Language;
    const modal = new ModalBuilder()
      .setCustomId('verify_modal')
      .setTitle(getLocalized('verify.modal_title', modalLang));

    const input = new TextInputBuilder()
      .setCustomId('captcha_code')
      .setLabel(getLocalized('verify.modal_label', modalLang))
      .setStyle(TextInputStyle.Short)
      .setMinLength(6)
      .setMaxLength(6)
      .setRequired(true)
      .setPlaceholder('e.g. ABC123');

    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);
    modal.addComponents(row);

    await interaction.showModal(modal);
  } catch (err) {
    console.error('[Verify Submit] error:', err);
  }
}

/**
 * Handle the modal submission - validates the captcha
 * customId: verify_modal
 */
export async function handleVerifyModal(
  interaction: ModalSubmitInteraction
): Promise<void> {
  try {
    await interaction.deferReply({ ephemeral: true });

    const userId = interaction.user.id;
    const guildId = interaction.guildId!;
    const submitted = interaction.fields.getTextInputValue('captcha_code');

    // verify the code
    const result = VerificationService.verifySubmission(userId, submitted);

    if (result.expired) {
      await interaction.editReply({
        embeds: [error('Captcha expired', 'Please click "Verify" again to get a new code')],
      });
      
      await VerificationService.logAction(
        interaction.guild!,
        interaction.user,
        'expired',
        'Captcha session expired before submission'
      );
      return;
    }

    if (result.tooManyAttempts) {
      await interaction.editReply({
        embeds: [error('Too many attempts', 'Please wait and try again later')],
      });
      
      await VerificationService.logAction(
        interaction.guild!,
        interaction.user,
        'failed',
        'Exceeded max attempts (3)'
      );
      return;
    }

    if (!result.success) {
      await interaction.editReply({
        embeds: [
          error(
            'Wrong code',
            `The code you entered is incorrect. ${result.attemptsLeft} attempt(s) left.\n\nClick "Submit Code" to try again.`
          ),
        ],
      });
      return;
    }

    // SUCCESS! apply roles
    const config = VerificationService.getConfig(guildId);
    if (!config) {
      await interaction.editReply({
        embeds: [error('Config not found', 'Please contact an admin')],
      });
      return;
    }

    const member = interaction.member as any;
    const roleResult = await VerificationService.applyVerification(member, config);

    if (!roleResult.success) {
      await interaction.editReply({
        embeds: [error('Verification failed', roleResult.error || 'Could not assign roles')],
      });
      
      await VerificationService.logAction(
        interaction.guild!,
        interaction.user,
        'failed',
        roleResult.error || 'Role assignment failed'
      );
      return;
    }

    // log success
    await VerificationService.logAction(
      interaction.guild!,
      interaction.user,
      'success',
      'User successfully verified'
    );

    const completeLang = (getGuild(interaction.guildId!).language || 'en') as Language;
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle(getLocalized('verify.complete', completeLang))
          .setDescription([
            'Welcome to the server! 🎉',
            '',
            'You now have full access to all channels.',
          ].join('\n'))
          .setColor('#57f287'),
      ],
    });
  } catch (err) {
    console.error('[Verify Modal] error:', err);
    await interaction.editReply({
      embeds: [error('Something went wrong', 'Please try again')],
    }).catch(() => {});
  }
}

export default {
  handleVerifyButton,
  handleVerifySubmitButton,
  handleVerifyModal,
};
