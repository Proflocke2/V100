import {
  ButtonInteraction, ModalSubmitInteraction, Interaction, Message,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel,
  ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import db from '../../database/db';
import { ApplicationRow } from '../../utils/types';

// =================
// Multi-step DM session
// =================
interface ApplicationSession {
  appId: number;
  guildId: string;
  userId: string;
  questions: string[];
  answers: string[];
  currentQuestion: number;
  startedAt: number;
}

const activeSessions = new Map<string, ApplicationSession>();

// Cleanup expired sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [userId, session] of activeSessions.entries()) {
    if (now - session.startedAt > 30 * 60 * 1000) {
      activeSessions.delete(userId);
    }
  }
}, 5 * 60 * 1000);

// =================
// 1. /application create -> Modal -> save form
// =================
export async function handleApplicationCreateModal(interaction: ModalSubmitInteraction) {
  if (interaction.customId !== 'app_create_modal') return;

  try {
    const name = interaction.fields.getTextInputValue('app_name').trim();
    const description = interaction.fields.getTextInputValue('app_description').trim() || null;
    const questionsRaw = interaction.fields.getTextInputValue('app_questions');
    const buttonLabel = interaction.fields.getTextInputValue('app_button_label').trim() || 'Apply Now';

    const questions = questionsRaw
      .split('\n')
      .map(q => q.trim())
      .filter(q => q.length > 0)
      .slice(0, 25); // Max 25 questions

    if (questions.length === 0) {
      await interaction.reply({
        content: '❌ You need at least 1 question.',
        ephemeral: true,
      });
      return;
    }

    const result = db.prepare(
      'INSERT INTO applications (guild_id, name, description, questions, button_label) VALUES (?, ?, ?, ?, ?)'
    ).run(interaction.guildId, name, description, JSON.stringify(questions), buttonLabel);

    const newId = result.lastInsertRowid;

    const embed = new EmbedBuilder()
      .setTitle('✅ Application Created')
      .setColor(0x57f287)
      .addFields(
        { name: '📛 Name', value: name, inline: true },
        { name: '🆔 ID', value: `${newId}`, inline: true },
        { name: '❓ Questions', value: `${questions.length}`, inline: true },
      )
      .setDescription(
        `**Next steps:**\n` +
        `1️⃣ Set review channel:\n\`/application config id:${newId} review_channel:#mod-channel\`\n` +
        `2️⃣ Optional: Accept role:\n\`/application config id:${newId} accept_role:@Member\`\n` +
        `3️⃣ Post button:\n\`/application send id:${newId} channel:#apply\``
      );

    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (err) {
    console.error('[Application] Create error:', err);
    await interaction.reply({
      content: '❌ Failed to create application.',
      ephemeral: true,
    });
  }
}

// =================
// 2. User clicks "Apply Now" -> start DM session
// =================
export async function handleApplyButton(interaction: ButtonInteraction) {
  const appId = parseInt(interaction.customId.split('_')[1]);
  const app = db.prepare('SELECT * FROM applications WHERE id = ? AND active = 1')
    .get(appId) as ApplicationRow | undefined;

  if (!app) {
    await interaction.reply({ content: '❌ This application is no longer active.', ephemeral: true });
    return;
  }

  // Already has active session?
  if (activeSessions.has(interaction.user.id)) {
    await interaction.reply({
      content: '⚠️ You already have an active application. Check your DMs or type `cancel` to start over.',
      ephemeral: true,
    });
    return;
  }

  // Already submitted (pending)?
  const existing = db.prepare(
    'SELECT * FROM application_answers WHERE application_id = ? AND user_id = ? AND status IS NULL'
  ).get(appId, interaction.user.id);

  if (existing) {
    await interaction.reply({
      content: '⚠️ You already have a pending application for this form.',
      ephemeral: true,
    });
    return;
  }

  // Reapply cooldown — if the user was rejected, check how long ago it was.
  if (app.reapply_cooldown_days > 0) {
    const lastRejected = db.prepare(
      "SELECT reviewed_at FROM application_answers WHERE application_id = ? AND user_id = ? AND status = 'reject' ORDER BY reviewed_at DESC LIMIT 1"
    ).get(appId, interaction.user.id) as { reviewed_at: number } | undefined;
    if (lastRejected?.reviewed_at) {
      const cooldownSec  = app.reapply_cooldown_days * 86400;
      const elapsedSec   = Math.floor(Date.now() / 1000) - lastRejected.reviewed_at;
      if (elapsedSec < cooldownSec) {
        const unlocksAt = lastRejected.reviewed_at + cooldownSec;
        await interaction.reply({
          content: `⏳ You were recently rejected from this form. You can re-apply <t:${unlocksAt}:R>.`,
          ephemeral: true,
        });
        return;
      }
    }
  }

  // Max concurrent applications — limit total pending apps for this form.
  if (app.max_concurrent > 0) {
    const pendingCount = (db.prepare(
      "SELECT COUNT(*) as c FROM application_answers WHERE application_id = ? AND status IS NULL"
    ).get(appId) as { c: number }).c;
    if (pendingCount >= app.max_concurrent) {
      await interaction.reply({
        content: `⏳ This application is currently full (${app.max_concurrent} pending). Please check back later.`,
        ephemeral: true,
      });
      return;
    }
  }

  const questions: string[] = JSON.parse(app.questions);

  try {
    const dm = await interaction.user.createDM();

    const startEmbed = new EmbedBuilder()
      .setTitle(`📝 ${app.name}`)
      .setColor(0x5865f2)
      .setDescription(
        `Welcome! You will be asked **${questions.length} questions**.\n\n` +
        `📌 **How it works:**\n` +
        `• Answer each question by replying to this DM\n` +
        `• Type \`cancel\` at any time to cancel\n` +
        `• You have 30 minutes to complete\n\n` +
        `Let's begin! 👇`
      )
      .setFooter({ text: `Application ID: ${app.id} | Server: ${interaction.guild?.name ?? 'Unknown'}` });

    await dm.send({ embeds: [startEmbed] });

    const questionEmbed = new EmbedBuilder()
      .setTitle(`Question 1/${questions.length}`)
      .setColor(0x5865f2)
      .setDescription(`**${questions[0]}**`)
      .setFooter({ text: 'Type your answer below' });

    await dm.send({ embeds: [questionEmbed] });

    activeSessions.set(interaction.user.id, {
      appId,
      guildId: interaction.guildId!,
      userId: interaction.user.id,
      questions,
      answers: [],
      currentQuestion: 0,
      startedAt: Date.now(),
    });

    await interaction.reply({
      content: '✅ Check your DMs! I\'ve sent you the first question.',
      ephemeral: true,
    });

  } catch (err) {
    await interaction.reply({
      content: '❌ I couldn\'t send you a DM. Please enable DMs from server members and try again.',
      ephemeral: true,
    });
  }
}

// =================
// 3. User answers in DM
// =================
export async function handleApplicationDM(message: Message) {
  if (message.channel.type !== ChannelType.DM) return;
  if (message.author.bot) return;

  const session = activeSessions.get(message.author.id);
  if (!session) return;

  // Cancel
  if (message.content.toLowerCase().trim() === 'cancel') {
    activeSessions.delete(message.author.id);
    await message.reply({
      embeds: [new EmbedBuilder()
        .setTitle('❌ Application Cancelled')
        .setColor(0xed4245)
        .setDescription('Your application has been cancelled. You can apply again anytime!')
      ]
    });
    return;
  }

  if (message.content.length === 0) {
    await message.reply('⚠️ Please provide a valid answer.');
    return;
  }

  if (message.content.length > 1000) {
    await message.reply('⚠️ Your answer is too long. Max 1000 characters.');
    return;
  }

  // Save answer
  session.answers.push(message.content);
  session.currentQuestion++;

  // More questions?
  if (session.currentQuestion < session.questions.length) {
    const nextQ = session.questions[session.currentQuestion];
    const embed = new EmbedBuilder()
      .setTitle(`Question ${session.currentQuestion + 1}/${session.questions.length}`)
      .setColor(0x5865f2)
      .setDescription(`**${nextQ}**`)
      .setFooter({ text: 'Type your answer below | Type "cancel" to cancel' });

    await message.reply({ embeds: [embed] });
  } else {
    // All done - submit
    await submitApplication(message, session);
  }
}

// =================
// 4. Submit -> save & post in review channel
// =================
async function submitApplication(message: Message, session: ApplicationSession) {
  const app = db.prepare('SELECT * FROM applications WHERE id = ?')
    .get(session.appId) as ApplicationRow | undefined;

  if (!app) {
    activeSessions.delete(session.userId);
    await message.reply('❌ Application no longer exists.');
    return;
  }

  db.prepare(
    'INSERT INTO application_answers (application_id, guild_id, user_id, answers) VALUES (?, ?, ?, ?)'
  ).run(session.appId, session.guildId, session.userId, JSON.stringify(session.answers));

  const answerRow = db.prepare(
    'SELECT * FROM application_answers WHERE application_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1'
  ).get(session.appId, session.userId) as any;

  const confirmEmbed = new EmbedBuilder()
    .setTitle('✅ Application Submitted!')
    .setColor(0x57f287)
    .setDescription(
      `Thank you for your application to **${app.name}**!\n\n` +
      `Our staff will review your application and notify you of the decision.`
    )
    .setTimestamp();

  await message.reply({ embeds: [confirmEmbed] });

  // Post in review channel
  if (app.review_channel) {
    try {
      const guild = message.client.guilds.cache.get(session.guildId);
      const reviewCh = guild?.channels.cache.get(app.review_channel) as TextChannel | undefined;

      if (reviewCh) {
        const member = await guild?.members.fetch(session.userId).catch(() => null);
        const userTag = member?.user.tag ?? message.author.tag;
        const userAvatar = member?.user.displayAvatarURL() ?? message.author.displayAvatarURL();

        const reviewEmbed = new EmbedBuilder()
          .setTitle(`📋 New Application — ${app.name}`)
          .setColor(0x5865f2)
          .setThumbnail(userAvatar)
          .addFields(
            { name: '👤 Applicant', value: `<@${session.userId}> (${userTag})`, inline: true },
            { name: '🆔 User ID', value: session.userId, inline: true },
            { name: '⏱️ Submitted', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
          )
          .setFooter({ text: `Application ID: ${answerRow?.id ?? '?'}` })
          .setTimestamp();

        const maxFields = 22; // Discord limit 25, leave room for meta fields
        for (let i = 0; i < Math.min(session.questions.length, maxFields); i++) {
          const q = session.questions[i].slice(0, 256);
          const a = (session.answers[i] || '—').slice(0, 1024);
          reviewEmbed.addFields({ name: `❓ ${i + 1}. ${q}`, value: a, inline: false });
        }

        const btnRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`appaction_accept_${answerRow?.id}`)
            .setLabel('Accept')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅'),
          new ButtonBuilder()
            .setCustomId(`appaction_reject_${answerRow?.id}`)
            .setLabel('Reject')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('❌'),
        );

        await reviewCh.send({ embeds: [reviewEmbed], components: [btnRow] });
      }
    } catch (err) {
      console.error('[Application] Failed to post review:', err);
    }
  }

  activeSessions.delete(session.userId);
}

// =================
// 5. Admin clicks Accept/Reject -> opens REASON modal
// =================
export async function handleAppActionButton(interaction: ButtonInteraction) {
  const parts = interaction.customId.split('_');
  const action = parts[1] as 'accept' | 'reject';
  const answerId = parseInt(parts[2]);

  const answerRow = db.prepare('SELECT * FROM application_answers WHERE id = ?').get(answerId) as any;
  if (!answerRow) {
    await interaction.reply({ content: '❌ Application not found.', ephemeral: true });
    return;
  }

  if (answerRow.status) {
    await interaction.reply({
      content: `⚠️ Already ${answerRow.status}ed.`,
      ephemeral: true,
    });
    return;
  }

  // Open REASON modal
  const modal = new ModalBuilder()
    .setCustomId(`appreason_${action}_${answerId}`)
    .setTitle(`${action === 'accept' ? '✅ Accept' : '❌ Reject'} Application`);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Reason (sent to applicant via DM)')
        .setPlaceholder(action === 'accept'
          ? 'Welcome to the team! Your application impressed us.'
          : 'We do not have any open positions at this time.')
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(1000)
        .setRequired(true)
    )
  );

  await interaction.showModal(modal);
}

// =================
// 6. Admin submits Reason -> DM user
// =================
export async function handleAppReasonModal(interaction: ModalSubmitInteraction) {
  if (!interaction.customId.startsWith('appreason_')) return;

  const parts = interaction.customId.split('_');
  const action = parts[1] as 'accept' | 'reject';
  const answerId = parseInt(parts[2]);
  const reason = interaction.fields.getTextInputValue('reason').trim();

  const answerRow = db.prepare('SELECT * FROM application_answers WHERE id = ?').get(answerId) as any;
  if (!answerRow) {
    await interaction.reply({ content: '❌ Application not found.', ephemeral: true });
    return;
  }

  const app = db.prepare('SELECT * FROM applications WHERE id = ?')
    .get(answerRow.application_id) as ApplicationRow | undefined;

  // Update DB
  db.prepare(
    'UPDATE application_answers SET status = ?, reviewed_by = ?, reviewed_at = ?, review_reason = ? WHERE id = ?'
  ).run(action, interaction.user.id, Date.now(), reason, answerId);

  // DM user
  let dmSent = false;
  try {
    const member = await interaction.guild!.members.fetch(answerRow.user_id);
    const isAccepted = action === 'accept';

    const dmEmbed = new EmbedBuilder()
      .setTitle(isAccepted ? '✅ Application Accepted!' : '❌ Application Rejected')
      .setColor(isAccepted ? 0x57f287 : 0xed4245)
      .setDescription(
        `Your application for **${app?.name ?? 'Unknown'}** has been ` +
        `**${isAccepted ? 'accepted' : 'rejected'}**.\n\n` +
        `**Reason:**\n${reason}`
      )
      .setFooter({ text: `Server: ${interaction.guild!.name}` })
      .setTimestamp();

    await member.send({ embeds: [dmEmbed] });
    dmSent = true;

    // Add role if accepted
    if (isAccepted && app?.accept_role) {
      await member.roles.add(app.accept_role).catch(() => {});
    }
  } catch (err) {
    console.warn('[Apply] Could not DM user:', answerRow.user_id);
  }

  // ── Route to accepted / denied channel ────────────────────────────────────
  // Build a full summary embed of the application and post it automatically
  // to the configured channel so accepted/denied apps are neatly archived.
  const targetChannelId = action === 'accept' ? app?.accepted_channel : app?.denied_channel;
  if (targetChannelId && interaction.guild) {
    const targetCh = interaction.guild.channels.cache.get(targetChannelId) as TextChannel | undefined;
    if (targetCh) {
      const questions: string[] = JSON.parse(answerRow.questions ?? app?.questions ?? '[]');
      const answers: string[]   = JSON.parse(answerRow.answers   ?? '[]');

      const routedEmbed = new EmbedBuilder()
        .setTitle(`${action === 'accept' ? '✅ Accepted' : '❌ Denied'}: ${app?.name ?? 'Application'}`)
        .setColor(action === 'accept' ? 0x57f287 : 0xed4245)
        .setDescription(
          questions.map((q: string, i: number) =>
            `**${q}**\n${answers[i] ?? '*(no answer)*'}`
          ).join('\n\n').slice(0, 4000)
        )
        .addFields(
          { name: 'Applicant', value: `<@${answerRow.user_id}>`, inline: true },
          { name: action === 'accept' ? 'Accepted by' : 'Denied by', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Reason', value: reason.slice(0, 1000) },
        )
        .setTimestamp();

      await targetCh.send({ embeds: [routedEmbed] }).catch(() => {});
    }
  }

  // Update embed in log channel
  const colors: Record<string, number> = { accept: 0x57f287, reject: 0xed4245 };
  const labels: Record<string, string> = { accept: '✅ Accepted', reject: '❌ Rejected' };

  const oldEmbed = interaction.message?.embeds[0];
  if (oldEmbed && interaction.message) {
    const updated = EmbedBuilder.from(oldEmbed)
      .setColor(colors[action])
      .setFooter({ text: `${labels[action]} by ${interaction.user.tag} • Reason: ${reason.slice(0, 100)}` });

    await interaction.message.edit({ embeds: [updated], components: [] }).catch(() => {});
    await interaction.reply({
      content: `✅ Application ${action}ed.${dmSent ? '' : ' ⚠️ Could not DM user (DMs closed).'}`,
      ephemeral: true,
    });
  } else {
    await interaction.reply({
      content: `Application ${action}ed.${dmSent ? '' : ' ⚠️ Could not DM user.'}`,
      ephemeral: true,
    });
  }
}
