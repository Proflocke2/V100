// Language localization system for the bot
// Supports: English, German, French, Russian
// This is the COMPREHENSIVE localization file covering all bot modules

export type Language = 'en' | 'de' | 'fr' | 'ru';

interface LocalizationStrings {
  [key: string]: {
    [lang in Language]: string;
  };
}

// COMPREHENSIVE localization strings used across the entire bot
// Note: String substituion keys use {variable} format
const strings: LocalizationStrings = {
  // ═══════════════════════════════════════════════════════════════════
  // COMMON/GENERIC STRINGS
  // ═══════════════════════════════════════════════════════════════════
  'common.error': {
    en: '❌ An error occurred',
    de: '❌ Ein Fehler ist aufgetreten',
    fr: '❌ Une erreur est survenue',
    ru: '❌ Произошла ошибка',
  },
  'common.success': {
    en: '✅ Success',
    de: '✅ Erfolg',
    fr: '✅ Succès',
    ru: '✅ Успешно',
  },
  'common.no_permission': {
    en: '❌ You do not have permission to use this command',
    de: '❌ Du hast keine Berechtigung, diesen Befehl zu verwenden',
    fr: '❌ Vous n\'avez pas la permission d\'utiliser cette commande',
    ru: '❌ У вас нет прав на использование этой команды',
  },
  'common.invalid_channel': {
    en: '❌ Invalid channel specified',
    de: '❌ Ungültiger Kanal angegeben',
    fr: '❌ Canal invalide spécifié',
    ru: '❌ Указан неверный канал',
  },
  'common.invalid_role': {
    en: '❌ Invalid role specified',
    de: '❌ Ungültige Rolle angegeben',
    fr: '❌ Rôle invalide spécifié',
    ru: '❌ Указана неверная роль',
  },
  'common.invalid_user': {
    en: '❌ Invalid user specified',
    de: '❌ Ungültiger Benutzer angegeben',
    fr: '❌ Utilisateur invalide spécifié',
    ru: '❌ Указан неверный пользователь',
  },
  'common.must_be_admin': {
    en: '❌ Only administrators can use this command',
    de: '❌ Nur Administratoren können diesen Befehl verwenden',
    fr: '❌ Seuls les administrateurs peuvent utiliser cette commande',
    ru: '❌ Только администраторы могут использовать эту команду',
  },
  'common.reason': {
    en: 'Reason',
    de: 'Grund',
    fr: 'Raison',
    ru: 'Причина',
  },
  'common.user': {
    en: 'User',
    de: 'Benutzer',
    fr: 'Utilisateur',
    ru: 'Пользователь',
  },
  'common.role': {
    en: 'Role',
    de: 'Rolle',
    fr: 'Rôle',
    ru: 'Роль',
  },
  'common.channel': {
    en: 'Channel',
    de: 'Kanal',
    fr: 'Canal',
    ru: 'Канал',
  },

  // ═══════════════════════════════════════════════════════════════════
  // LANGUAGE COMMAND
  // ═══════════════════════════════════════════════════════════════════
  'language.set': {
    en: '🌍 Language Set',
    de: '🌍 Sprache eingestellt',
    fr: '🌍 Langue définie',
    ru: '🌍 Язык установлен',
  },
  'language.changed': {
    en: 'Server language has been changed to {language}',
    de: 'Die Serversprache wurde zu {language} geändert',
    fr: 'La langue du serveur a été changée en {language}',
    ru: 'Язык сервера был изменен на {language}',
  },
  'language.current': {
    en: 'Current server language: **{language}**',
    de: 'Aktuelle Serversprache: **{language}**',
    fr: 'Langue actuelle du serveur: **{language}**',
    ru: 'Текущий язык сервера: **{language}**',
  },
  'language.available': {
    en: 'Available Languages',
    de: 'Verfügbare Sprachen',
    fr: 'Langues disponibles',
    ru: 'Доступные языки',
  },

  // ═══════════════════════════════════════════════════════════════════
  // UTILITY COMMANDS
  // ═══════════════════════════════════════════════════════════════════
  'ping.title': {
    en: '🏓 Pong!',
    de: '🏓 Pong!',
    fr: '🏓 Pong!',
    ru: '🏓 Pong!',
  },
  'ping.latency': {
    en: 'Roundtrip',
    de: 'Reaktionszeit',
    fr: 'Allerretour',
    ru: 'Туда и обратно',
  },
  'ping.websocket': {
    en: 'WebSocket',
    de: 'WebSocket',
    fr: 'WebSocket',
    ru: 'WebSocket',
  },
  'botinfo.title': {
    en: 'Bot Information',
    de: 'Bot-Informationen',
    fr: 'Informations sur le bot',
    ru: 'Информация о боте',
  },
  'botinfo.uptime': {
    en: 'Uptime',
    de: 'Betriebszeit',
    fr: 'Temps de fonctionnement',
    ru: 'Время работы',
  },
  'botinfo.servers': {
    en: 'Servers',
    de: 'Server',
    fr: 'Serveurs',
    ru: 'Серверы',
  },
  'botinfo.users': {
    en: 'Users',
    de: 'Benutzer',
    fr: 'Utilisateurs',
    ru: 'Пользователи',
  },
  'botinfo.ping': {
    en: 'Ping',
    de: 'Ping',
    fr: 'Ping',
    ru: 'Пинг',
  },
  'botinfo.nodejs': {
    en: 'Node.js',
    de: 'Node.js',
    fr: 'Node.js',
    ru: 'Node.js',
  },
  'botinfo.memory': {
    en: 'Memory',
    de: 'Speicher',
    fr: 'Mémoire',
    ru: 'Память',
  },
  'botinfo.platform': {
    en: 'Platform',
    de: 'Plattform',
    fr: 'Plateforme',
    ru: 'Платформа',
  },
  'serverinfo.title': {
    en: 'Server Information',
    de: 'Server-Informationen',
    fr: 'Informations sur le serveur',
    ru: 'Информация о сервере',
  },
  'serverinfo.owner': {
    en: 'Owner',
    de: 'Besitzer',
    fr: 'Propriétaire',
    ru: 'Владелец',
  },
  'serverinfo.members': {
    en: 'Members',
    de: 'Mitglieder',
    fr: 'Membres',
    ru: 'Члены',
  },
  'serverinfo.created': {
    en: 'Created',
    de: 'Erstellt',
    fr: 'Créé',
    ru: 'Создано',
  },
  'serverinfo.roles': {
    en: 'Roles',
    de: 'Rollen',
    fr: 'Rôles',
    ru: 'Роли',
  },
  'serverinfo.channels': {
    en: 'Channels',
    de: 'Kanäle',
    fr: 'Canaux',
    ru: 'Каналы',
  },
  'userinfo.title': {
    en: 'User Information',
    de: 'Benutzer-Informationen',
    fr: 'Informations utilisateur',
    ru: 'Информация о пользователе',
  },
  'userinfo.joined': {
    en: 'Joined',
    de: 'Beigetreten',
    fr: 'Rejoins',
    ru: 'Присоединился',
  },
  'userinfo.registered': {
    en: 'Registered',
    de: 'Registriert',
    fr: 'Enregistré',
    ru: 'Зарегистрирован',
  },
  'userinfo.roles': {
    en: 'Roles',
    de: 'Rollen',
    fr: 'Rôles',
    ru: 'Роли',
  },
  'userinfo.status': {
    en: 'Status',
    de: 'Status',
    fr: 'Statut',
    ru: 'Статус',
  },
  'avatar.title': {
    en: 'Avatar for {user}',
    de: 'Avatar für {user}',
    fr: 'Avatar pour {user}',
    ru: 'Аватар для {user}',
  },
  'announce.sent': {
    en: '✅ Announcement sent to {channel}',
    de: '✅ Ankündigung an {channel} gesendet',
    fr: '✅ Annonce envoyée à {channel}',
    ru: '✅ Объявление отправлено в {channel}',
  },
  'embed.title': {
    en: 'Custom Embed',
    de: 'Benutzerdefiniertes Embed',
    fr: 'Embed personnalisé',
    ru: 'Пользовательский Embed',
  },
  'embed.sent': {
    en: '✅ Embed sent',
    de: '✅ Embed gesendet',
    fr: '✅ Embed envoyé',
    ru: '✅ Embed отправлен',
  },

  // ═══════════════════════════════════════════════════════════════════
  // MODERATION COMMANDS
  // ═══════════════════════════════════════════════════════════════════
  'mod.user_warned': {
    en: '⚠️ {user} has been warned',
    de: '⚠️ {user} wurde verwarnt',
    fr: '⚠️ {user} a été averti',
    ru: '⚠️ {user} получил предупреждение',
  },
  'mod.warn_title': {
    en: 'User Warned',
    de: 'Benutzer verwarnt',
    fr: 'Utilisateur averti',
    ru: 'Пользователь предупрежден',
  },
  'mod.user_muted': {
    en: '🔇 {user} has been muted for {duration}',
    de: '🔇 {user} wurde für {duration} stummgeschaltet',
    fr: '🔇 {user} a été rendu muet pendant {duration}',
    ru: '🔇 {user} был отключен на {duration}',
  },
  'mod.mute_title': {
    en: 'User Muted',
    de: 'Benutzer stummgeschaltet',
    fr: 'Utilisateur rendu muet',
    ru: 'Пользователь отключен',
  },
  'mod.user_unmuted': {
    en: '🔊 {user} has been unmuted',
    de: '🔊 {user} wurde stummschaltung aufgehoben',
    fr: '🔊 {user} a eu le son rétabli',
    ru: '🔊 Для {user} отключение звука отменено',
  },
  'mod.unmute_title': {
    en: 'User Unmuted',
    de: 'Stummschaltung aufgehoben',
    fr: 'Utilisateur remis en sourdine',
    ru: 'Отключение отменено',
  },
  'mod.user_kicked': {
    en: '👢 {user} has been kicked',
    de: '👢 {user} wurde gekickt',
    fr: '👢 {user} a été expulsé',
    ru: '👢 {user} был исключен',
  },
  'mod.kick_title': {
    en: 'User Kicked',
    de: 'Benutzer gekickt',
    fr: 'Utilisateur expulsé',
    ru: 'Пользователь исключен',
  },
  'mod.user_banned': {
    en: '🚫 {user} has been banned',
    de: '🚫 {user} wurde gebannt',
    fr: '🚫 {user} a été banni',
    ru: '🚫 {user} был забанен',
  },
  'mod.ban_title': {
    en: 'User Banned',
    de: 'Benutzer gebannt',
    fr: 'Utilisateur banni',
    ru: 'Пользователь забанен',
  },
  'mod.user_unbanned': {
    en: '✅ {user} has been unbanned',
    de: '✅ {user} wurde entsperrt',
    fr: '✅ {user} a été débanni',
    ru: '✅ {user} был разбанен',
  },
  'mod.unban_title': {
    en: 'User Unbanned',
    de: 'Verbot aufgehoben',
    fr: 'Utilisateur débanni',
    ru: 'Бан отменен',
  },
  'mod.warnings': {
    en: 'Warnings',
    de: 'Verwarnungen',
    fr: 'Avertissements',
    ru: 'Предупреждения',
  },
  'mod.user_warnings': {
    en: 'Warnings for {user}',
    de: 'Verwarnungen für {user}',
    fr: 'Avertissements pour {user}',
    ru: 'Предупреждения для {user}',
  },
  'mod.warnings_cleared': {
    en: '✅ Warnings cleared for {user}',
    de: '✅ Verwarnungen für {user} gelöscht',
    fr: '✅ Avertissements effacés pour {user}',
    ru: '✅ Предупреждения для {user} удалены',
  },
  'mod.locked': {
    en: '🔒 Channel locked',
    de: '🔒 Kanal gesperrt',
    fr: '🔒 Canal verrouillé',
    ru: '🔒 Канал заблокирован',
  },
  'mod.unlocked': {
    en: '🔓 Channel unlocked',
    de: '🔓 Kanal entsperrt',
    fr: '🔓 Canal déverrouillé',
    ru: '🔓 Канал разблокирован',
  },
  'mod.slowmode_set': {
    en: '⏱️ Slowmode set to {duration}',
    de: '⏱️ Langsamheit auf {duration} gesetzt',
    fr: '⏱️ Mode lent défini sur {duration}',
    ru: '⏱️ Медленный режим установлен на {duration}',
  },
  'mod.messages_purged': {
    en: '🗑️ {count} messages purged',
    de: '🗑️ {count} Nachrichten gelöscht',
    fr: '🗑️ {count} messages supprimés',
    ru: '🗑️ {count} сообщений удалено',
  },
  'mod.role_added': {
    en: '✅ Role {role} added to {user}',
    de: '✅ Rolle {role} zu {user} hinzugefügt',
    fr: '✅ Rôle {role} ajouté à {user}',
    ru: '✅ Роль {role} добавлена для {user}',
  },
  'mod.role_removed': {
    en: '✅ Role {role} removed from {user}',
    de: '✅ Rolle {role} von {user} entfernt',
    fr: '✅ Rôle {role} supprimé de {user}',
    ru: '✅ Роль {role} удалена для {user}',
  },
  'mod.nick_changed': {
    en: '✅ Nickname changed to {nick}',
    de: '✅ Spitzname zu {nick} geändert',
    fr: '✅ Surnom changé en {nick}',
    ru: '✅ Ник изменен на {nick}',
  },
  'mod.automod_enabled': {
    en: '✅ AutoMod enabled',
    de: '✅ AutoMod aktiviert',
    fr: '✅ AutoMod activé',
    ru: '✅ AutoMod включен',
  },
  'mod.automod_disabled': {
    en: '❌ AutoMod disabled',
    de: '❌ AutoMod deaktiviert',
    fr: '❌ AutoMod désactivé',
    ru: '❌ AutoMod отключен',
  },

  // ═══════════════════════════════════════════════════════════════════
  // ANTI-NUKE
  // ═══════════════════════════════════════════════════════════════════
  'antinuke.enabled': { en: '🛡️ Anti-Nuke Enabled', de: '🛡️ Anti-Nuke Aktiviert', fr: '🛡️ Anti-Nuke Activé', ru: '🛡️ Anti-Nuke Включён' },
  'antinuke.disabled': { en: '🛡️ Anti-Nuke Disabled', de: '🛡️ Anti-Nuke Deaktiviert', fr: '🛡️ Anti-Nuke Désactivé', ru: '🛡️ Anti-Nuke Отключён' },
  'antinuke.setup_desc': {
    en: '**Action:** {action}\n**Channel deletions:** max {ch_del} in {window}s\n**Role deletions:** max {role_del} in {window}s\n**Mass bans:** max {ban_lim} in {window}s\n**Webhooks:** max {wh_lim} in {window}s\n**Log channel:** {log_ch}\n\n⚠️ Add yourself with `/antinuke whitelist`!',
    de: '**Aktion:** {action}\n**Kanal-Löschungen:** max. {ch_del} in {window}s\n**Rollen-Löschungen:** max. {role_del} in {window}s\n**Massen-Bans:** max. {ban_lim} in {window}s\n**Webhooks:** max. {wh_lim} in {window}s\n**Log-Kanal:** {log_ch}\n\n⚠️ Trage dich selbst mit `/antinuke whitelist` ein!',
    fr: '**Action:** {action}\n**Suppressions de salons:** max {ch_del} en {window}s\n**Suppressions de rôles:** max {role_del} en {window}s\n**Bans massifs:** max {ban_lim} en {window}s\n**Webhooks:** max {wh_lim} en {window}s\n**Salon de logs:** {log_ch}\n\n⚠️ Ajoutez-vous avec `/antinuke whitelist`!',
    ru: '**Действие:** {action}\n**Удалений каналов:** макс. {ch_del} за {window}с\n**Удалений ролей:** макс. {role_del} за {window}с\n**Массовых банов:** макс. {ban_lim} за {window}с\n**Вебхуков:** макс. {wh_lim} за {window}с\n**Лог-канал:** {log_ch}\n\n⚠️ Добавьте себя через `/antinuke whitelist`!',
  },
  'antinuke.owner_exempt': {
    en: 'The server owner is automatically exempt.',
    de: 'Der Server-Owner ist automatisch ausgenommen.',
    fr: 'Le propriétaire du serveur est automatiquement exempté.',
    ru: 'Владелец сервера автоматически исключён.',
  },
  'antinuke.wl_added': {
    en: '<@{user}> is now exempt from Anti-Nuke.\n**Note:** Only grant this to trusted admins.',
    de: '<@{user}> ist jetzt von Anti-Nuke ausgenommen.\n**Achtung:** Vergib dies nur an vertrauenswürdige Admins.',
    fr: '<@{user}> est maintenant exempté d\'Anti-Nuke.\n**Attention:** Accordez cela uniquement aux admins de confiance.',
    ru: '<@{user}> теперь освобождён от Anti-Nuke.\n**Внимание:** Давайте это только проверенным администраторам.',
  },
  'antinuke.wl_not_found': { en: '<@{user}> is not on the whitelist.', de: '<@{user}> steht nicht auf der Whitelist.', fr: '<@{user}> n\'est pas sur la liste blanche.', ru: '<@{user}> не в белом списке.' },
  'antinuke.wl_removed': { en: '<@{user}> has been removed from the whitelist.', de: '<@{user}> wurde von der Whitelist entfernt.', fr: '<@{user}> a été retiré de la liste blanche.', ru: '<@{user}> удалён из белого списка.' },
  'antinuke.wl_empty': { en: 'No entries. (Server owner is always exempt.)', de: 'Keine Einträge. (Server-Owner ist immer ausgenommen.)', fr: 'Aucune entrée. (Le propriétaire est toujours exempté.)', ru: 'Записей нет. (Владелец сервера всегда исключён.)' },
  'antinuke.wl_added_by': { en: 'added by', de: 'hinzugefügt von', fr: 'ajouté par', ru: 'добавлен' },
  'antinuke.no_incidents': { en: 'Anti-Nuke has not intervened yet.', de: 'Anti-Nuke hat noch nicht eingegriffen.', fr: 'Anti-Nuke n\'est pas encore intervenu.', ru: 'Anti-Nuke ещё не вмешивался.' },
  'antinuke.incidents_title': { en: '🚨 Anti-Nuke — Recent Interventions', de: '🚨 Anti-Nuke — Letzte Eingriffe', fr: '🚨 Anti-Nuke — Interventions récentes', ru: '🚨 Anti-Nuke — Последние вмешательства' },
  'antinuke.status_title': { en: '🛡️ Anti-Nuke Status', de: '🛡️ Anti-Nuke Status', fr: '🛡️ Statut Anti-Nuke', ru: '🛡️ Статус Anti-Nuke' },
  'antinuke.field_status': { en: 'Status', de: 'Status', fr: 'Statut', ru: 'Статус' },
  'antinuke.field_action': { en: 'Action', de: 'Aktion', fr: 'Action', ru: 'Действие' },
  'antinuke.field_log': { en: 'Log Channel', de: 'Log-Kanal', fr: 'Salon de logs', ru: 'Лог-канал' },
  'antinuke.field_window': { en: 'Time Window', de: 'Zeitfenster', fr: 'Fenêtre temporelle', ru: 'Временное окно' },
  'antinuke.field_ch_del': { en: 'Channel Deletions', de: 'Kanal-Löschungen', fr: 'Suppressions de salons', ru: 'Удалений каналов' },
  'antinuke.field_role_del': { en: 'Role Deletions', de: 'Rollen-Löschungen', fr: 'Suppressions de rôles', ru: 'Удалений ролей' },
  'antinuke.field_bans': { en: 'Mass Bans', de: 'Massen-Bans', fr: 'Bans massifs', ru: 'Массовых банов' },
  'antinuke.field_webhooks': { en: 'Webhooks', de: 'Webhooks', fr: 'Webhooks', ru: 'Вебхуки' },
  'antinuke.field_whitelist': { en: 'Whitelist', de: 'Whitelist', fr: 'Liste blanche', ru: 'Белый список' },
  'antinuke.field_entries': { en: '{n} entries', de: '{n} Einträge', fr: '{n} entrées', ru: '{n} записей' },
  'antinuke.active': { en: '✅ Active', de: '✅ Aktiv', fr: '✅ Actif', ru: '✅ Активен' },
  'antinuke.inactive': { en: '❌ Inactive', de: '❌ Inaktiv', fr: '❌ Inactif', ru: '❌ Неактивен' },
  'antinuke.not_set': { en: 'Not set', de: 'Nicht gesetzt', fr: 'Non défini', ru: 'Не задан' },
  'antinuke.max': { en: 'max {n}', de: 'max. {n}', fr: 'max {n}', ru: 'макс. {n}' },

  // ═══════════════════════════════════════════════════════════════════
  // LOCKDOWN
  // ═══════════════════════════════════════════════════════════════════
  'lockdown.started': { en: '🔒 Lockdown activated', de: '🔒 Lockdown aktiviert', fr: '🔒 Verrouillage activé', ru: '🔒 Блокировка активирована' },
  'lockdown.ended': { en: '🔓 Lockdown ended', de: '🔓 Lockdown beendet', fr: '🔓 Verrouillage terminé', ru: '🔓 Блокировка снята' },
  'lockdown.channel_locked': { en: '🔒 Channel locked', de: '🔒 Kanal gesperrt', fr: '🔒 Salon verrouillé', ru: '🔒 Канал заблокирован' },
  'lockdown.channel_unlocked': { en: '🔓 Channel unlocked', de: '🔓 Kanal entsperrt', fr: '🔓 Salon déverrouillé', ru: '🔓 Канал разблокирован' },
  'lockdown.locked_desc': { en: 'This channel has been temporarily locked.\n**Reason:** {reason}', de: 'Dieser Kanal wurde temporär gesperrt.\n**Grund:** {reason}', fr: 'Ce salon a été temporairement verrouillé.\n**Raison:** {reason}', ru: 'Канал временно заблокирован.\n**Причина:** {reason}' },
  'lockdown.unlocked_desc': { en: 'The lockdown for this channel has been lifted.', de: 'Der Lockdown für diesen Kanal wurde aufgehoben.', fr: 'Le verrouillage de ce salon a été levé.', ru: 'Блокировка этого канала снята.' },
  'lockdown.summary_locked': { en: '✅ **{n}** channel(s) locked', de: '✅ **{n}** Kanal(e) gesperrt', fr: '✅ **{n}** salon(s) verrouillé(s)', ru: '✅ **{n}** канал(ов) заблокировано' },
  'lockdown.summary_unlocked': { en: '**{n}** channel(s) unlocked', de: '**{n}** Kanal(e) entsperrt', fr: '**{n}** salon(s) déverrouillé(s)', ru: '**{n}** канал(ов) разблокировано' },
  'lockdown.summary_failed': { en: '⚠️ {n} failed', de: '⚠️ {n} fehlgeschlagen', fr: '⚠️ {n} échoué(s)', ru: '⚠️ {n} не удалось' },
  'lockdown.status_title': { en: '🔒 Active Lockdown', de: '🔒 Aktiver Lockdown', fr: '🔒 Verrouillage actif', ru: '🔒 Активная блокировка' },
  'lockdown.status_desc': { en: '**{n}** channel(s) locked:', de: '**{n}** Kanal(e) gesperrt:', fr: '**{n}** salon(s) verrouillé(s):', ru: '**{n}** канал(ов) заблокировано:' },
  'lockdown.no_active': { en: 'No active lockdown.', de: 'Kein aktiver Lockdown.', fr: 'Aucun verrouillage actif.', ru: 'Активной блокировки нет.' },
  'lockdown.default_reason': { en: 'Lockdown activated', de: 'Lockdown aktiviert', fr: 'Verrouillage activé', ru: 'Блокировка активирована' },

  // ═══════════════════════════════════════════════════════════════════
  // MASSBAN
  // ═══════════════════════════════════════════════════════════════════
  'massban.no_valid_ids': { en: 'No valid user IDs found.', de: 'Keine gültigen User-IDs gefunden.', fr: 'Aucun ID utilisateur valide.', ru: 'Допустимых ID пользователей не найдено.' },
  'massban.too_many': { en: 'Maximum 200 IDs per command.', de: 'Maximal 200 IDs pro Befehl.', fr: 'Maximum 200 IDs par commande.', ru: 'Максимум 200 ID за команду.' },
  'massban.no_recent': { en: 'No users joined in the last {minutes} minutes.', de: 'Keine User in den letzten {minutes} Minuten beigetreten.', fr: 'Aucun utilisateur rejoint dans les dernières {minutes} minutes.', ru: 'За последние {minutes} минут никто не вступил.' },
  'massban.done_title': { en: '🔨 Mass-ban completed', de: '🔨 Mass-Ban abgeschlossen', fr: '🔨 Ban massif terminé', ru: '🔨 Массовый бан выполнен' },
  'massban.field_banned': { en: '✅ Banned', de: '✅ Gebannt', fr: '✅ Bannis', ru: '✅ Забанено' },
  'massban.field_failed': { en: '❌ Failed', de: '❌ Fehlgeschlagen', fr: '❌ Échoués', ru: '❌ Не удалось' },
  'massban.field_reason': { en: 'Reason', de: 'Grund', fr: 'Raison', ru: 'Причина' },
  'massban.field_ids': { en: 'Banned IDs', de: 'Gebannte IDs', fr: 'IDs bannis', ru: 'Забаненные ID' },

  // ═══════════════════════════════════════════════════════════════════
  // NOTES
  // ═══════════════════════════════════════════════════════════════════
  'notes.saved': { en: '📝 Note saved', de: '📝 Notiz gespeichert', fr: '📝 Note enregistrée', ru: '📝 Заметка сохранена' },
  'notes.saved_desc': { en: '**To:** <@{user}>\n**Note:** {note}', de: '**Zu:** <@{user}>\n**Notiz:** {note}', fr: '**À:** <@{user}>\n**Note:** {note}', ru: '**Кому:** <@{user}>\n**Заметка:** {note}' },
  'notes.list_title': { en: '📝 Notes — {user}', de: '📝 Notizen — {user}', fr: '📝 Notes — {user}', ru: '📝 Заметки — {user}' },
  'notes.none': { en: 'No notes found.', de: 'Keine Notizen vorhanden.', fr: 'Aucune note trouvée.', ru: 'Заметок нет.' },
  'notes.footer': { en: '{n} note(s) total', de: '{n} Notiz(en) insgesamt', fr: '{n} note(s) au total', ru: 'Всего {n} заметок' },
  'notes.not_found': { en: 'Note not found.', de: 'Notiz nicht gefunden.', fr: 'Note introuvable.', ru: 'Заметка не найдена.' },
  'notes.deleted': { en: '🗑️ Note #{id} deleted.', de: '🗑️ Notiz #{id} gelöscht.', fr: '🗑️ Note #{id} supprimée.', ru: '🗑️ Заметка #{id} удалена.' },
  'notes.delete_title': { en: '🗑️ Deleted', de: '🗑️ Entfernt', fr: '🗑️ Supprimé', ru: '🗑️ Удалено' },

  // ═══════════════════════════════════════════════════════════════════
  // INFRACTIONS
  // ═══════════════════════════════════════════════════════════════════
  'infractions.title': { en: '⚖️ Infraction Record — {user}', de: '⚖️ Strafakte — {user}', fr: '⚖️ Dossier d\'infractions — {user}', ru: '⚖️ История нарушений — {user}' },
  'infractions.field_account': { en: '👤 Account', de: '👤 Account', fr: '👤 Compte', ru: '👤 Аккаунт' },
  'infractions.field_joined': { en: '📅 Joined', de: '📅 Beigetreten', fr: '📅 A rejoint', ru: '📅 Вступил' },
  'infractions.field_warns': { en: '⚠️ Warnings', de: '⚠️ Verwarnungen', fr: '⚠️ Avertissements', ru: '⚠️ Предупреждений' },
  'infractions.field_timeouts': { en: '⏱️ Timeouts', de: '⏱️ Timeouts', fr: '⏱️ Expulsions temporaires', ru: '⏱️ Таймаутов' },
  'infractions.field_kicks': { en: '👟 Kicks', de: '👟 Kicks', fr: '👟 Expulsions', ru: '👟 Киков' },
  'infractions.field_bans': { en: '🔨 Bans', de: '🔨 Bans', fr: '🔨 Bannissements', ru: '🔨 Банов' },
  'infractions.field_notes': { en: '📝 Notes', de: '📝 Notizen', fr: '📝 Notes', ru: '📝 Заметок' },
  'infractions.field_recent_warns': { en: '📋 Recent warnings', de: '📋 Letzte Verwarnungen', fr: '📋 Derniers avertissements', ru: '📋 Последние предупреждения' },
  'infractions.not_on_server': { en: 'Not on server', de: 'Nicht auf Server', fr: 'Pas sur le serveur', ru: 'Не на сервере' },
  'infractions.created_ago': { en: 'Created {days} days ago', de: 'Erstellt vor {days} Tagen', fr: 'Créé il y a {days} jours', ru: 'Создан {days} дней назад' },

  // ═══════════════════════════════════════════════════════════════════
  // STICKY MUTE
  // ═══════════════════════════════════════════════════════════════════
  'stickymute.invalid_duration': { en: 'Invalid duration. Format: `30m`, `2h`, `7d`, `1w` or `permanent`', de: 'Ungültige Dauer. Format: `30m`, `2h`, `7d`, `1w` oder `permanent`', fr: 'Durée invalide. Format: `30m`, `2h`, `7d`, `1w` ou `permanent`', ru: 'Неверная длительность. Формат: `30m`, `2h`, `7d`, `1w` или `permanent`' },
  'stickymute.applied_title': { en: '🔇 Sticky mute applied', de: '🔇 Sticky-Mute vergeben', fr: '🔇 Muet persistant appliqué', ru: '🔇 Постоянный мут применён' },
  'stickymute.applied_desc': { en: '**User:** <@{user}>\n**Duration:** {duration}\n**Reason:** {reason}\n\n*The mute persists even after leaving and rejoining.*', de: '**User:** <@{user}>\n**Dauer:** {duration}\n**Grund:** {reason}\n\n*Der Mute bleibt auch nach Verlassen/Wiederbetreten aktiv.*', fr: '**Utilisateur:** <@{user}>\n**Durée:** {duration}\n**Raison:** {reason}\n\n*Le muet persiste même après avoir quitté et rejoint.*', ru: '**Пользователь:** <@{user}>\n**Длительность:** {duration}\n**Причина:** {reason}\n\n*Мут сохраняется даже после выхода и повторного вступления.*' },
  'stickymute.permanent': { en: '**Permanent**', de: '**Permanent**', fr: '**Permanent**', ru: '**Навсегда**' },
  'stickymute.no_mute': { en: '<@{user}> has no active sticky mute.', de: '<@{user}> hat keinen aktiven Sticky-Mute.', fr: '<@{user}> n\'a aucun muet persistant actif.', ru: 'У <@{user}> нет активного постоянного мута.' },
  'stickymute.removed_title': { en: '🔊 Sticky mute removed', de: '🔊 Sticky-Mute aufgehoben', fr: '🔊 Muet persistant levé', ru: '🔊 Постоянный мут снят' },
  'stickymute.removed_desc': { en: '<@{user}> can use the server normally again.', de: '<@{user}> kann den Server wieder normal nutzen.', fr: '<@{user}> peut à nouveau utiliser le serveur normalement.', ru: '<@{user}> снова может нормально пользоваться сервером.' },
  'stickymute.list_title': { en: '🔇 Sticky Mutes', de: '🔇 Sticky-Mutes', fr: '🔇 Muets persistants', ru: '🔇 Постоянные муты' },
  'stickymute.list_none': { en: 'No active sticky mutes.', de: 'Keine aktiven Sticky-Mutes.', fr: 'Aucun muet persistant actif.', ru: 'Активных постоянных мутов нет.' },
  'stickymute.list_active_title': { en: '🔇 Active Sticky Mutes ({n})', de: '🔇 Aktive Sticky-Mutes ({n})', fr: '🔇 Muets persistants actifs ({n})', ru: '🔇 Активные постоянные муты ({n})' },
  'stickymute.expires': { en: 'expires', de: 'läuft ab', fr: 'expire', ru: 'истекает' },
  'stickymute.permanent_short': { en: '∞ Permanent', de: '∞ Permanent', fr: '∞ Permanent', ru: '∞ Навсегда' },
  'stickymute.expired': { en: '(expired)', de: '(abgelaufen)', fr: '(expiré)', ru: '(истёк)' },
  'stickymute.no_reason': { en: 'no reason', de: 'kein Grund', fr: 'sans raison', ru: 'без причины' },

  // ═══════════════════════════════════════════════════════════════════
  // SECURITY ENGINE (runtime alerts)
  // ═══════════════════════════════════════════════════════════════════
  'security.warning_title': { en: '⚠️ Warning', de: '⚠️ Verwarnung', fr: '⚠️ Avertissement', ru: '⚠️ Предупреждение' },
  'security.warning_desc': { en: 'You violated a security rule on **{server}**.\n**Reason:** {reason}\n\nPlease follow the server rules.', de: 'Du hast eine Sicherheitsregel auf **{server}** verletzt.\n**Grund:** {reason}\n\nBitte halte dich an die Serverregeln.', fr: 'Vous avez violé une règle de sécurité sur **{server}**.\n**Raison:** {reason}\n\nVeuillez respecter les règles du serveur.', ru: 'Вы нарушили правило безопасности на **{server}**.\n**Причина:** {reason}\n\nПожалуйста, соблюдайте правила сервера.' },
  'security.slowdown_title': { en: '⚠️ Slow down', de: '⚠️ Langsamer', fr: '⚠️ Ralentissez', ru: '⚠️ Медленнее' },
  'security.slowdown_desc': { en: '**{server}:** You are sending messages too fast.', de: '**{server}:** Du sendest Nachrichten zu schnell.', fr: '**{server}:** Vous envoyez des messages trop vite.', ru: '**{server}:** Вы отправляете сообщения слишком быстро.' },
  'security.msg_removed': { en: 'Your message was removed. **Reason:** {reason}', de: 'Deine Nachricht wurde entfernt. **Grund:** {reason}', fr: 'Votre message a été supprimé. **Raison:** {reason}', ru: 'Ваше сообщение удалено. **Причина:** {reason}' },
  'security.phishing_title': { en: '🎣 Phishing Link Detected', de: '🎣 Phishing-Link erkannt', fr: '🎣 Lien de phishing détecté', ru: '🎣 Обнаружена фишинговая ссылка' },
  'security.phishing_desc': { en: '<@{user}> sent a phishing link.\nContent: `{content}`\nAction: **{action}**', de: '<@{user}> hat einen Phishing-Link gesendet.\nInhalt: `{content}`\nAktion: **{action}**', fr: '<@{user}> a envoyé un lien de phishing.\nContenu: `{content}`\nAction: **{action}**', ru: '<@{user}> отправил фишинговую ссылку.\nСодержимое: `{content}`\nДействие: **{action}**' },
  'security.lockdown_title': { en: '🔒 AUTO-LOCKDOWN ACTIVE', de: '🔒 AUTO-LOCKDOWN AKTIV', fr: '🔒 VERROUILLAGE AUTO ACTIF', ru: '🔒 АВТОБЛОКИРОВКА АКТИВНА' },
  'security.lockdown_desc': { en: '**Reason:** {reason}\n**Channels locked:** {count}\n**Auto-lift:** in 5 minutes\n\nUse `/raid-end` or `/lockdown end` to unlock immediately.', de: '**Grund:** {reason}\n**Kanäle gesperrt:** {count}\n**Automatische Entsperrung:** in 5 Minuten\n\nVerwende `/raid-end` oder `/lockdown end` für sofortige Entsperrung.', fr: '**Raison:** {reason}\n**Salons verrouillés:** {count}\n**Levée automatique:** dans 5 minutes\n\nUtilisez `/raid-end` ou `/lockdown end` pour déverrouiller immédiatement.', ru: '**Причина:** {reason}\n**Каналов заблокировано:** {count}\n**Авто-снятие:** через 5 минут\n\nИспользуйте `/raid-end` или `/lockdown end` для немедленной разблокировки.' },
  'security.raid_title': { en: '🚨 RAID DETECTED', de: '🚨 RAID ERKANNT', fr: '🚨 RAID DÉTECTÉ', ru: '🚨 РЕЙД ОБНАРУЖЕН' },
  'security.raid_desc': { en: '**{count}** joins in **{window}s** — threshold: {threshold}\nAction: **{action}** on <@{user}>\nSeverity: **{severity}**', de: '**{count}** Joins in **{window}s** — Schwellenwert: {threshold}\nAktion: **{action}** auf <@{user}>\nSeverity: **{severity}**', fr: '**{count}** entrées en **{window}s** — seuil: {threshold}\nAction: **{action}** sur <@{user}>\nSévérité: **{severity}**', ru: '**{count}** вступлений за **{window}с** — порог: {threshold}\nДействие: **{action}** для <@{user}>\nУровень: **{severity}**' },
  'security.age_title': { en: '🔰 Account-Age Gate', de: '🔰 Account-Alter-Sperre', fr: '🔰 Filtre d\'âge du compte', ru: '🔰 Фильтр возраста аккаунта' },
  'security.age_desc': { en: '<@{user}> — Account age: {age}min (minimum: {min}min)\nAction: **{action}**', de: '<@{user}> — Account-Alter: {age}min (Minimum: {min}min)\nAktion: **{action}**', fr: '<@{user}> — Âge du compte: {age}min (minimum: {min}min)\nAction: **{action}**', ru: '<@{user}> — Возраст аккаунта: {age}мин (минимум: {min}мин)\nДействие: **{action}**' },
  'security.spam_warn': { en: 'You are sending messages too fast ({count} in {window}s).', de: 'Du sendest Nachrichten zu schnell ({count} in {window}s).', fr: 'Vous envoyez des messages trop vite ({count} en {window}s).', ru: 'Вы отправляете сообщения слишком быстро ({count} за {window}с).' },
  'security.link_warn': { en: 'Posting invite links is not allowed.', de: 'Das Posten von Einladungslinks ist nicht erlaubt.', fr: 'La publication de liens d\'invitation n\'est pas autorisée.', ru: 'Публикация пригласительных ссылок запрещена.' },
  'security.ping_warn': { en: 'Too many mentions ({count}). Maximum: {max}.', de: 'Zu viele Mentions ({count}). Maximum: {max}.', fr: 'Trop de mentions ({count}). Maximum: {max}.', ru: 'Слишком много упоминаний ({count}). Максимум: {max}.' },
  'security.caps_warn': { en: 'Please avoid writing in ALL CAPS.', de: 'Bitte schreibe nicht in GROSSBUCHSTABEN.', fr: 'Veuillez éviter d\'écrire en MAJUSCULES.', ru: 'Пожалуйста, не пишите ЗАГЛАВНЫМИ БУКВАМИ.' },
  'security.phishing_warn': { en: 'Phishing links are not allowed.', de: 'Phishing-Links sind nicht erlaubt.', fr: 'Les liens de phishing ne sont pas autorisés.', ru: 'Фишинговые ссылки запрещены.' },

  // ═══════════════════════════════════════════════════════════════════
  // SECURITY CONFIG (menu)
  // ═══════════════════════════════════════════════════════════════════
  'sec.sev_low':         { en: 'Low',             de: 'Niedrig',           fr: 'Faible',           ru: 'Низкий' },
  'sec.sev_medium':      { en: 'Medium',           de: 'Mittel',            fr: 'Moyen',            ru: 'Средний' },
  'sec.sev_high':        { en: 'High (Aggressive)',de: 'Hoch (Aggressiv)',  fr: 'Élevé (Agressif)', ru: 'Высокий (Агрессивный)' },
  'sec.sev_low_desc':    { en: 'Warnings & message deletion only — no timeout/kick', de: 'Nur Warnungen & Nachrichten löschen — kein Timeout/Kick', fr: 'Avertissements et suppression de messages uniquement', ru: 'Только предупреждения и удаление сообщений' },
  'sec.sev_medium_desc': { en: 'Temporary timeout (10 min) + message deletion', de: 'Temporärer Timeout (10 min) + Nachrichten löschen', fr: 'Expulsion temporaire (10 min) + suppression', ru: 'Временный таймаут (10 мин) + удаление сообщений' },
  'sec.sev_high_desc':   { en: 'Immediate kick/ban + auto server-lockdown (< 3s response)', de: 'Sofortige Kick/Ban + automatischer Server-Lockdown (< 3s Reaktion)', fr: 'Kick/ban immédiat + verrouillage auto du serveur', ru: 'Немедленный кик/бан + автоблокировка сервера (< 3с)' },
  'sec.feat_antiraid_desc':  { en: 'Join-spike detection & automatic lockdown', de: 'Join-Spike-Erkennung & automatischer Lockdown', fr: 'Détection de spike de rejoins & verrouillage auto', ru: 'Обнаружение всплеска вступлений и автоблокировка' },
  'sec.feat_antispam_desc':  { en: 'Sliding-window message frequency monitoring', de: 'Sliding-Window Nachrichtenfrequenz-Überwachung', fr: 'Surveillance de fréquence de messages', ru: 'Мониторинг частоты сообщений' },
  'sec.feat_link_desc':      { en: 'Block unauthorized links & Discord invites', de: 'Unerlaubte Links & Discord-Einladungen blockieren', fr: 'Bloquer liens non autorisés et invitations Discord', ru: 'Блокировка несанкционированных ссылок и приглашений' },
  'sec.feat_phishing_desc':  { en: 'Automatically remove known phishing patterns', de: 'Bekannte Phishing-Muster automatisch entfernen', fr: 'Supprimer automatiquement les modèles de phishing', ru: 'Автоматическое удаление фишинговых шаблонов' },
  'sec.feat_ping_desc':      { en: 'Instantly delete & punish mass-mentions', de: 'Mass-Mentions sofort löschen & bestrafen', fr: 'Supprimer et punir immédiatement les mass-mentions', ru: 'Немедленно удалять и наказывать за массовые упоминания' },
  'sec.feat_age_desc':       { en: 'Block new accounts below minimum age', de: 'Neue Accounts mit zu geringem Alter blockieren', fr: 'Bloquer les comptes trop récents', ru: 'Блокировка слишком новых аккаунтов' },
  'sec.feat_caps_desc':      { en: 'Auto-delete ALL-CAPS spam', de: 'GROSSBUCHSTABEN-Spam automatisch löschen', fr: 'Supprimer automatiquement le spam en MAJUSCULES', ru: 'Автоудаление спама ЗАГЛАВНЫМИ БУКВАМИ' },
  'sec.feat_nuke_desc':      { en: 'Protection against compromised mod accounts', de: 'Schutz vor gehackten Mod-Accounts', fr: 'Protection contre les comptes de modos compromis', ru: 'Защита от скомпрометированных аккаунтов модераторов' },
  'sec.modal_raid_threshold': { en: 'Anti-Raid: joins until alarm (e.g. 10)', de: 'Anti-Raid: Joins bis Alarm (z.B. 10)', fr: 'Anti-Raid: entrées avant alarme (ex. 10)', ru: 'Anti-Raid: вступлений до сигнала (напр. 10)' },
  'sec.modal_raid_window':    { en: 'Anti-Raid: time window in seconds (e.g. 10)', de: 'Anti-Raid: Zeitfenster in Sekunden (z.B. 10)', fr: 'Anti-Raid: fenêtre temporelle en secondes', ru: 'Anti-Raid: временное окно в секундах (напр. 10)' },
  'sec.modal_spam_threshold': { en: 'Anti-Spam: messages until alarm (e.g. 5)', de: 'Anti-Spam: Nachrichten bis Alarm (z.B. 5)', fr: 'Anti-Spam: messages avant alarme (ex. 5)', ru: 'Anti-Spam: сообщений до сигнала (напр. 5)' },
  'sec.modal_spam_window':    { en: 'Anti-Spam: time window in seconds (e.g. 3)', de: 'Anti-Spam: Zeitfenster in Sekunden (z.B. 3)', fr: 'Anti-Spam: fenêtre temporelle en secondes', ru: 'Anti-Spam: временное окно в секундах (напр. 3)' },
  'sec.modal_mass_ping':      { en: 'Mass-Ping: max. mentions per message (e.g. 5)', de: 'Mass-Ping: Max. Mentions pro Nachricht (z.B. 5)', fr: 'Mass-Ping: max. mentions par message (ex. 5)', ru: 'Mass-Ping: макс. упоминаний в сообщении (напр. 5)' },
  'sec.modal_channel_id_label': { en: 'Channel ID (right-click → Copy ID)', de: 'Kanal-ID (Rechtsklick → ID kopieren)', fr: 'ID du salon (clic droit → Copier l\'identifiant)', ru: 'ID канала (правая кнопка → Копировать ID)' },

  'sec.title': { en: '🔐 Security Configuration', de: '🔐 Security-Konfiguration', fr: '🔐 Configuration sécurité', ru: '🔐 Настройки безопасности' },
  'sec.status': { en: '**Status:** {status}  •  **Lockdown:** {lockdown}', de: '**Status:** {status}  •  **Lockdown:** {lockdown}', fr: '**Statut:** {status}  •  **Verrouillage:** {lockdown}', ru: '**Статус:** {status}  •  **Блокировка:** {lockdown}' },
  'sec.active': { en: '✅ Active', de: '✅ Aktiv', fr: '✅ Actif', ru: '✅ Активна' },
  'sec.inactive': { en: '❌ Disabled', de: '❌ Deaktiviert', fr: '❌ Désactivé', ru: '❌ Отключена' },
  'sec.lockdown_active': { en: '🔴 **ACTIVE**', de: '🔴 **AKTIV**', fr: '🔴 **ACTIF**', ru: '🔴 **АКТИВНА**' },
  'sec.lockdown_inactive': { en: '🟢 Inactive', de: '🟢 Inaktiv', fr: '🟢 Inactif', ru: '🟢 Неактивна' },
  'sec.thresholds': { en: '**Thresholds:**', de: '**Schwellenwerte:**', fr: '**Seuils:**', ru: '**Пороги:**' },
  'sec.raid_threshold': { en: '• Anti-Raid: **{n}** joins in **{w}s**', de: '• Anti-Raid: **{n}** Joins in **{w}s**', fr: '• Anti-Raid: **{n}** entrées en **{w}s**', ru: '• Anti-Raid: **{n}** вступлений за **{w}с**' },
  'sec.spam_threshold': { en: '• Anti-Spam: **{n}** msgs in **{w}s**', de: '• Anti-Spam: **{n}** Nachrichten in **{w}s**', fr: '• Anti-Spam: **{n}** messages en **{w}s**', ru: '• Anti-Spam: **{n}** сообщений за **{w}с**' },
  'sec.ping_limit': { en: '• Mass-Ping: max. **{n}** mentions', de: '• Mass-Ping: max. **{n}** Mentions', fr: '• Mass-Ping: max. **{n}** mentions', ru: '• Mass-Ping: макс. **{n}** упоминаний' },
  'sec.min_age': { en: '• Min. account age: **{n}** minutes', de: '• Min. Account-Alter: **{n}** Minuten', fr: '• Âge min. du compte: **{n}** minutes', ru: '• Мин. возраст аккаунта: **{n}** минут' },
  'sec.log_channel': { en: '• Log channel: {ch}', de: '• Log-Kanal: {ch}', fr: '• Salon de logs: {ch}', ru: '• Лог-канал: {ch}' },
  'sec.log_not_set': { en: '_not set_', de: '_nicht gesetzt_', fr: '_non défini_', ru: '_не задан_' },
  'sec.features_title': { en: '**Features:**', de: '**Features:**', fr: '**Fonctionnalités:**', ru: '**Функции:**' },
  'sec.footer': { en: 'Use the buttons below to change settings', de: 'Verwende die Buttons unten um Einstellungen zu ändern', fr: 'Utilisez les boutons ci-dessous pour modifier les paramètres', ru: 'Используйте кнопки ниже для изменения настроек' },
  'sec.feat_select_title': { en: '⚙️ Select features', de: '⚙️ Features auswählen', fr: '⚙️ Sélectionner les fonctionnalités', ru: '⚙️ Выбор функций' },
  'sec.feat_select_desc': { en: 'Select active security modules.\nCurrently active modules are pre-selected.', de: 'Wähle die aktiven Sicherheits-Module.\nAktuell aktive Module sind vorausgewählt.', fr: 'Sélectionnez les modules de sécurité actifs.\nLes modules actifs sont présélectionnés.', ru: 'Выберите активные модули безопасности.\nТекущие активные модули уже выбраны.' },
  'sec.severity_title': { en: '⚡ Choose severity level', de: '⚡ Severity Level wählen', fr: '⚡ Choisir le niveau de sévérité', ru: '⚡ Выбор уровня серьёзности' },
  'sec.btn_back': { en: '◀ Back', de: '◀ Zurück', fr: '◀ Retour', ru: '◀ Назад' },
  'sec.btn_enable': { en: '🟢 Enable', de: '🟢 Aktivieren', fr: '🟢 Activer', ru: '🟢 Включить' },
  'sec.btn_disable': { en: '🔴 Disable', de: '🔴 Deaktivieren', fr: '🔴 Désactiver', ru: '🔴 Отключить' },
  'sec.btn_thresholds': { en: '🔢 Thresholds', de: '🔢 Schwellenwerte', fr: '🔢 Seuils', ru: '🔢 Пороги' },
  'sec.btn_log': { en: '📋 Log Channel', de: '📋 Log-Kanal', fr: '📋 Salon logs', ru: '📋 Лог-канал' },
  'sec.btn_incidents': { en: '📊 Incidents', de: '📊 Incidents', fr: '📊 Incidents', ru: '📊 Инциденты' },
  'sec.btn_lift': { en: '🔓 Lift lockdown', de: '🔓 Lockdown aufheben', fr: '🔓 Lever le verrouillage', ru: '🔓 Снять блокировку' },
  'sec.btn_test_lock': { en: '🔒 Test lockdown', de: '🔒 Lockdown testen', fr: '🔒 Tester verrouillage', ru: '🔒 Тест блокировки' },
  'sec.lifted': { en: '✅ Lockdown lifted — {n} channel(s) unlocked.', de: '✅ Lockdown aufgehoben — {n} Kanal(e) entsperrt.', fr: '✅ Verrouillage levé — {n} salon(s) déverrouillé(s).', ru: '✅ Блокировка снята — {n} канал(ов) разблокировано.' },
  'sec.lockdown_warning': { en: 'This locks ALL text channels for @everyone.\n\n**For testing only!** The lockdown auto-lifts after 5 minutes.\n\nContinue?', de: 'Dies sperrt ALLE Textkanäle für @everyone.\n\n**Nur zum Testen nutzen!** Der Lockdown wird automatisch nach 5 Minuten aufgehoben.\n\nFortfahren?', fr: 'Cela verrouille TOUS les salons textuels pour @everyone.\n\n**À des fins de test uniquement!** Le verrouillage est automatiquement levé après 5 minutes.\n\nContinuer?', ru: 'Это заблокирует ВСЕ текстовые каналы для @everyone.\n\n**Только для тестирования!** Блокировка автоматически снимается через 5 минут.\n\nПродолжить?' },
  'sec.lockdown_confirm_btn': { en: '🔒 Yes, start lockdown', de: '🔒 Ja, Lockdown starten', fr: '🔒 Oui, démarrer le verrouillage', ru: '🔒 Да, начать блокировку' },
  'sec.btn_cancel': { en: 'Cancel', de: 'Abbrechen', fr: 'Annuler', ru: 'Отмена' },
  'sec.incidents_title': { en: '📊 Recent security incidents (15)', de: '📊 Letzte Security-Incidents (15)', fr: '📊 Incidents sécurité récents (15)', ru: '📊 Последние инциденты безопасности (15)' },
  'sec.no_incidents': { en: 'No incidents in the database.', de: 'Keine Incidents in der DB.', fr: 'Aucun incident en base de données.', ru: 'Инцидентов в базе данных нет.' },
  'sec.channel_not_found': { en: 'Channel not found', de: 'Kanal nicht gefunden', fr: 'Salon introuvable', ru: 'Канал не найден' },
  'sec.channel_not_text': { en: 'ID `{id}` is not a text channel on this server.', de: 'ID `{id}` ist kein Text-Kanal in diesem Server.', fr: 'L\'ID `{id}` n\'est pas un salon texte sur ce serveur.', ru: 'ID `{id}` не является текстовым каналом на этом сервере.' },

  // ═══════════════════════════════════════════════════════════════════
  // RAID-END
  // ═══════════════════════════════════════════════════════════════════
  'raidend.done_title': { en: '🛡️ Post-raid cleanup completed', de: '🛡️ Raid-Nachsorge abgeschlossen', fr: '🛡️ Nettoyage post-raid terminé', ru: '🛡️ Очистка после рейда завершена' },
  'raidend.unlocked': { en: '🔓 **{n} channel(s) unlocked**', de: '🔓 **{n} Kanal(e) entsperrt**', fr: '🔓 **{n} salon(s) déverrouillé(s)**', ru: '🔓 **{n} канал(ов) разблокировано**' },
  'raidend.no_lockdown': { en: '🟢 No active lockdown found — server was already open.', de: '🟢 Kein aktiver Lockdown gefunden — Server war bereits offen.', fr: '🟢 Aucun verrouillage actif — le serveur était déjà ouvert.', ru: '🟢 Активной блокировки не найдено — сервер уже был открыт.' },
  'raidend.tracking_reset': { en: '🔄 **Join & spam windows reset** — Anti-Raid starts fresh.', de: '🔄 **Join- & Spam-Sliding-Windows zurückgesetzt** — Anti-Raid startet sauber.', fr: '🔄 **Fenêtres de suivi réinitialisées** — Anti-Raid repart à zéro.', ru: '🔄 **Окна отслеживания сброшены** — Anti-Raid стартует чисто.' },
  'raidend.incidents_title': { en: '📊 Incidents (last 30 min.)', de: '📊 Incidents (letzte 30 Min.)', fr: '📊 Incidents (30 dernières min.)', ru: '📊 Инциденты (последние 30 мин.)' },
  'raidend.incidents_none': { en: 'No incidents in the last 30 minutes.', de: 'Keine Incidents in den letzten 30 Minuten.', fr: 'Aucun incident dans les 30 dernières minutes.', ru: 'Инцидентов за последние 30 минут нет.' },
  'raidend.recent_events': { en: '🔍 Last 10 events', de: '🔍 Letzte 10 Ereignisse', fr: '🔍 10 derniers événements', ru: '🔍 Последние 10 событий' },
  'raidend.footer': { en: 'Security severity: {sev} • Executed by {user}', de: 'Security-Severity: {sev} • Ausgeführt von {user}', fr: 'Sévérité sécurité: {sev} • Exécuté par {user}', ru: 'Уровень безопасности: {sev} • Выполнил {user}' },
  'raidend.footer_note': { en: 'Note: {note}', de: 'Notiz: {note}', fr: 'Note: {note}', ru: 'Заметка: {note}' },
  'raidend.view_bans': { en: '🔓 View attacker bans', de: '🔓 Angreifer-Bans einsehen', fr: '🔓 Voir les bans attaquants', ru: '🔓 Просмотр банов атакующих' },
  'raidend.all_done': { en: '✅ All done', de: '✅ Alles erledigt', fr: '✅ Tout est fait', ru: '✅ Всё готово' },
  'raidend.no_bans': { en: 'No users were banned by the Security Engine (or the bans are > 30 min. old).', de: 'Durch die Security-Engine wurden keine User gebannt (oder die Bans liegen > 30 Min. zurück).', fr: 'Aucun utilisateur n\'a été banni par le moteur de sécurité (ou les bans datent de plus de 30 min).', ru: 'Security Engine не забанил ни одного пользователя (или баны старше 30 мин.).' },
  'raidend.bans_title': { en: '⚠️ {n} banned attacker(s) (last 30 min.)', de: '⚠️ {n} gebannte Angreifer (letzte 30 Min.)', fr: '⚠️ {n} attaquant(s) banni(s) (30 dernières min.)', ru: '⚠️ {n} забаненных атакующих (последние 30 мин.)' },
  'raidend.bans_warning': { en: '**Warning:** Only unban if you are sure these are false positives.\nReal raiders should stay banned.', de: '**Achtung:** Nur aufheben wenn du sicher bist, dass es sich um False-Positives handelt.\nEchte Raider sollten gebannt bleiben.', fr: '**Attention:** Ne débannissez que si vous êtes sûr qu\'il s\'agit de faux positifs.\nLes vrais raiders doivent rester bannis.', ru: '**Внимание:** Разбаньте только если уверены, что это ложные срабатывания.\nНастоящие рейдеры должны оставаться забаненными.' },
  'raidend.unban_all': { en: '🔓 Unban all {n} ban(s)', de: '🔓 Alle {n} Bans aufheben', fr: '🔓 Lever les {n} ban(s)', ru: '🔓 Снять все {n} банов' },
  'raidend.unban_done': { en: '{n} ban(s) lifted successfully.', de: '{n} Ban(s) erfolgreich aufgehoben.', fr: '{n} ban(s) levé(s) avec succès.', ru: '{n} банов успешно снято.' },
  'raidend.unban_partial': { en: '{ok} lifted, {fail} failed (users may not be banned).', de: '{ok} erfolgreich, {fail} fehlgeschlagen (User möglicherweise nicht gebannt).', fr: '{ok} levé(s), {fail} échoué(s) (utilisateurs peut-être pas bannis).', ru: '{ok} снято, {fail} не удалось (пользователи, возможно, не заблокированы).' },

  // ═══════════════════════════════════════════════════════════════════
  // LEVEL & XP SYSTEM
  // ═══════════════════════════════════════════════════════════════════
  'level.title': {
    en: 'Level & XP',
    de: 'Level & XP',
    fr: 'Niveau & XP',
    ru: 'Уровень & XP',
  },
  'level.level': {
    en: 'Level',
    de: 'Stufe',
    fr: 'Niveau',
    ru: 'Уровень',
  },
  'level.xp': {
    en: 'Experience Points',
    de: 'Erfahrungspunkte',
    fr: 'Points d\'expérience',
    ru: 'Очки опыта',
  },
  'level.progress': {
    en: 'Progress to next level',
    de: 'Fortschritt zum nächsten Level',
    fr: 'Progression vers le niveau suivant',
    ru: 'Прогресс к следующему уровню',
  },
  'level.system_enabled': {
    en: '✅ Leveling system enabled',
    de: '✅ Level-System aktiviert',
    fr: '✅ Système de niveau activé',
    ru: '✅ Система уровней включена',
  },
  'level.system_disabled': {
    en: '❌ Leveling system disabled',
    de: '❌ Level-System deaktiviert',
    fr: '❌ Système de niveau désactivé',
    ru: '❌ Система уровней отключена',
  },
  'level.reset': {
    en: '✅ Level data reset for {user}',
    de: '✅ Level-Daten für {user} zurückgesetzt',
    fr: '✅ Données de niveau réinitialisées pour {user}',
    ru: '✅ Данные уровня для {user} сброшены',
  },
  'level.reward_added': {
    en: '✅ Reward added: Role {role} at level {level}',
    de: '✅ Belohnung hinzugefügt: Rolle {role} auf Level {level}',
    fr: '✅ Récompense ajoutée: Rôle {role} au niveau {level}',
    ru: '✅ Награда добавлена: Роль {role} на уровне {level}',
  },
  'level.reward_removed': {
    en: '✅ Reward removed for level {level}',
    de: '✅ Belohnung für Level {level} entfernt',
    fr: '✅ Récompense supprimée pour le niveau {level}',
    ru: '✅ Награда удалена для уровня {level}',
  },
  'level.config': {
    en: 'Level Configuration',
    de: 'Level-Konfiguration',
    fr: 'Configuration des niveaux',
    ru: 'Конфигурация уровней',
  },

  // ═══════════════════════════════════════════════════════════════════
  // ECONOMY SYSTEM
  // ═══════════════════════════════════════════════════════════════════
  'economy.balance': {
    en: 'Balance',
    de: 'Kontostand',
    fr: 'Solde',
    ru: 'Баланс',
  },
  'economy.coins': {
    en: 'Coins',
    de: 'Münzen',
    fr: 'Pièces',
    ru: 'Монеты',
  },
  'economy.wallet': {
    en: 'Wallet',
    de: 'Geldbörse',
    fr: 'Portefeuille',
    ru: 'Кошелек',
  },
  'economy.bank': {
    en: 'Bank',
    de: 'Bank',
    fr: 'Banque',
    ru: 'Банк',
  },
  'economy.total': {
    en: 'Total',
    de: 'Gesamt',
    fr: 'Total',
    ru: 'Всего',
  },
  'economy.paid': {
    en: '✅ {sender} paid {amount} to {receiver}',
    de: '✅ {sender} zahlte {amount} an {receiver}',
    fr: '✅ {sender} a payé {amount} à {receiver}',
    ru: '✅ {sender} заплатил {amount} пользователю {receiver}',
  },
  'economy.insufficient': {
    en: '❌ Insufficient balance',
    de: '❌ Unzureichender Kontostand',
    fr: '❌ Solde insuffisant',
    ru: '❌ Недостаточно средств',
  },
  'economy.leaderboard': {
    en: 'Money Leaderboard',
    de: 'Geld-Rangliste',
    fr: 'Classement argent',
    ru: 'Рейтинг денег',
  },
  'economy.rank': {
    en: 'Rank',
    de: 'Rang',
    fr: 'Classement',
    ru: 'Ранг',
  },
  'economy.games': {
    en: '🎮 Games',
    de: '🎮 Spiele',
    fr: '🎮 Parties',
    ru: '🎮 Игры',
  },
  'economy.total_won': {
    en: '✅ Total Won',
    de: '✅ Gesamt gewonnen',
    fr: '✅ Total gagné',
    ru: '✅ Всего выиграно',
  },
  'economy.total_lost': {
    en: '❌ Total Lost',
    de: '❌ Gesamt verloren',
    fr: '❌ Total perdu',
    ru: '❌ Всего проиграно',
  },
  'economy.leaderboard.empty': {
    en: 'No entries yet.',
    de: 'Noch keine Einträge.',
    fr: 'Aucune entrée pour l\'instant.',
    ru: 'Записей пока нет.',
  },

  // ── PAY ──────────────────────────────────────────────────────────
  'economy.pay.self': {
    en: 'You cannot pay yourself.',
    de: 'Du kannst dir selbst keine Coins schicken.',
    fr: 'Vous ne pouvez pas vous payer vous-même.',
    ru: 'Нельзя платить самому себе.',
  },
  'economy.pay.bot': {
    en: 'Bots cannot receive coins.',
    de: 'Bots können keine Coins empfangen.',
    fr: 'Les bots ne peuvent pas recevoir de pièces.',
    ru: 'Боты не могут получать монеты.',
  },
  'economy.pay.transfer': {
    en: '💸 Transfer',
    de: '💸 Überweisung',
    fr: '💸 Virement',
    ru: '💸 Перевод',
  },

  // ── ADMIN ────────────────────────────────────────────────────────
  'economy.admin.adjusted': {
    en: 'Coins adjusted',
    de: 'Coins angepasst',
    fr: 'Pièces ajustées',
    ru: 'Монеты скорректированы',
  },
  'economy.admin.set': {
    en: 'Coins set',
    de: 'Coins gesetzt',
    fr: 'Pièces définies',
    ru: 'Монеты установлены',
  },
  'economy.admin.set_desc': {
    en: '{user} now has **{amount}** coins',
    de: '{user} hat jetzt **{amount}** Coins',
    fr: '{user} a maintenant **{amount}** pièces',
    ru: '{user} теперь имеет **{amount}** монет',
  },
  'economy.admin.info': {
    en: 'Economy Info',
    de: 'Economy-Info',
    fr: 'Info économie',
    ru: 'Экономика',
  },
  'economy.admin.won': {
    en: 'Won',
    de: 'Gewonnen',
    fr: 'Gagné',
    ru: 'Выиграно',
  },
  'economy.admin.lost': {
    en: 'Lost',
    de: 'Verloren',
    fr: 'Perdu',
    ru: 'Проиграно',
  },
  'economy.admin.games': {
    en: 'Games',
    de: 'Spiele',
    fr: 'Parties',
    ru: 'Игры',
  },

  // ── DISCLAIMER ───────────────────────────────────────────────────
  'economy.disclaimer.title': {
    en: '⚠️ Gambling Notice',
    de: '⚠️ Gambling-Hinweis',
    fr: '⚠️ Avertissement Jeux',
    ru: '⚠️ Предупреждение',
  },
  'economy.disclaimer.description': {
    en: '**This game uses virtual coins only — no real monetary value.**\n\nParticipation is at your own risk.\nThis feature is intended for **persons aged 18 and over** only.\n\n*Please play responsibly and set yourself limits.*',
    de: '**Dieses Spiel verwendet ausschließlich virtuelle Coins ohne echten Geldwert.**\n\nDie Nutzung erfolgt auf eigene Gefahr.\nDieses Feature ist nur für **Personen ab 18 Jahren** bestimmt.\n\n*Bitte spiele verantwortungsvoll und setze dir Grenzen.*',
    fr: '**Ce jeu utilise uniquement des pièces virtuelles sans valeur monétaire réelle.**\n\nLa participation se fait à vos risques.\nCette fonctionnalité est réservée aux **personnes de 18 ans et plus**.\n\n*Jouez de manière responsable et fixez-vous des limites.*',
    ru: '**Эта игра использует только виртуальные монеты без реальной денежной ценности.**\n\nУчастие осуществляется на ваш страх и риск.\nЭта функция предназначена только для **лиц от 18 лет и старше**.\n\n*Пожалуйста, играйте ответственно и устанавливайте для себя ограничения.*',
  },
  'economy.disclaimer.footer': {
    en: '🔞 18+ only • Virtual coins only • No real stakes',
    de: '🔞 Nur ab 18 Jahren • Virtuelle Coins • Keine echten Einsätze',
    fr: '🔞 18+ seulement • Pièces virtuelles • Pas d\'enjeux réels',
    ru: '🔞 Только 18+ • Виртуальные монеты • Без реальных ставок',
  },
  'economy.disclaimer.accept_btn': {
    en: '✅ I agree',
    de: '✅ Ich stimme zu',
    fr: '✅ J\'accepte',
    ru: '✅ Я согласен',
  },
  'economy.disclaimer.decline_btn': {
    en: '❌ Decline',
    de: '❌ Ablehnen',
    fr: '❌ Refuser',
    ru: '❌ Отклонить',
  },
  'economy.disclaimer.accepted': {
    en: '✅ Agreed! Starting game...',
    de: '✅ Zugestimmt! Spiel wird gestartet...',
    fr: '✅ Accepté! Démarrage du jeu...',
    ru: '✅ Принято! Запуск игры...',
  },
  'economy.disclaimer.declined_title': {
    en: '❌ Cancelled',
    de: '❌ Abgebrochen',
    fr: '❌ Annulé',
    ru: '❌ Отменено',
  },
  'economy.disclaimer.declined_desc': {
    en: 'You declined the gambling disclaimer. No coins were deducted.',
    de: 'Du hast den Gambling-Hinweis abgelehnt. Es wurden keine Coins abgezogen.',
    fr: 'Vous avez refusé l\'avertissement de jeu. Aucune pièce n\'a été déduite.',
    ru: 'Вы отклонили предупреждение об азартных играх. Монеты не были списаны.',
  },
  'economy.disclaimer.expired': {
    en: '⏱️ Expired',
    de: '⏱️ Abgelaufen',
    fr: '⏱️ Expiré',
    ru: '⏱️ Истekло',
  },
  'economy.disclaimer.expired_desc': {
    en: 'The disclaimer expired (60s). Please start a new game.',
    de: 'Der Disclaimer ist abgelaufen (60s). Bitte starte ein neues Spiel.',
    fr: 'L\'avertissement a expiré (60s). Veuillez démarrer une nouvelle partie.',
    ru: 'Предупреждение истекло (60s). Пожалуйста, начните новую игру.',
  },

  // ── COOLDOWN ─────────────────────────────────────────────────────
  'economy.cooldown.wait_title': {
    en: '⏳ Please wait!',
    de: '⏳ Bitte warten!',
    fr: '⏳ Veuillez patienter!',
    ru: '⏳ Подождите!',
  },
  'economy.cooldown.wait_desc': {
    en: 'You can play again in **{time}**.\nThere is a global cooldown of **15 seconds** between gambling commands.',
    de: 'Du kannst erst in **{time}** wieder spielen.\nZwischen zwei Gambling-Commands gilt ein globaler Cooldown von **15 Sekunden**.',
    fr: 'Vous pouvez rejouer dans **{time}**.\nIl y a un cooldown global de **15 secondes** entre les commandes de jeu.',
    ru: 'Вы сможете снова играть через **{time}**.\nМежду командами азартных игр действует глобальный кулдаун **15 секунд**.',
  },
  'economy.cooldown.session_title': {
    en: '🛑 Session limit reached',
    de: '🛑 Session-Limit erreicht',
    fr: '🛑 Limite de session atteinte',
    ru: '🛑 Лимит сессии достигнут',
  },
  'economy.cooldown.session_desc': {
    en: 'You have played too many games in the last 30 minutes.\nTake a break – you can play again in **{time}**.',
    de: 'Du hast innerhalb von 30 Minuten zu viele Spiele gespielt.\nEntspann dich kurz – du kannst in **{time}** wieder weitermachen.',
    fr: 'Vous avez joué trop de parties au cours des 30 dernières minutes.\nFaites une pause – vous pouvez rejouer dans **{time}**.',
    ru: 'Вы сыграли слишком много игр за последние 30 минут.\nСделайте перерыв – вы сможете снова играть через **{time}**.',
  },

  // ── SLOTS ────────────────────────────────────────────────────────
  'economy.slots.jackpot': {
    en: '🎰 ★ JACKPOT! ★',
    de: '🎰 ★ JACKPOT! ★',
    fr: '🎰 ★ JACKPOT! ★',
    ru: '🎰 ★ ДЖЕКПОТ! ★',
  },
  'economy.slots.win': {
    en: '🎰 Win!',
    de: '🎰 Gewonnen!',
    fr: '🎰 Gagné!',
    ru: '🎰 Выигрыш!',
  },
  'economy.slots.no_luck': {
    en: '🎰 No luck',
    de: '🎰 Kein Glück',
    fr: '🎰 Pas de chance',
    ru: '🎰 Не повезло',
  },
  'economy.slots.break_even': {
    en: '➡️ Break Even',
    de: '➡️ Unentschieden',
    fr: '➡️ Égalité',
    ru: '➡️ При своих',
  },
  'economy.slots.grid': {
    en: '🎰 Grid',
    de: '🎰 Raster',
    fr: '🎰 Grille',
    ru: '🎰 Сетка',
  },
  'economy.slots.win_lines': {
    en: '🏆 Win Lines',
    de: '🏆 Gewinnlinien',
    fr: '🏆 Lignes gagnantes',
    ru: '🏆 Выигрышные линии',
  },
  'economy.slots.footer': {
    en: 'Bet: {bet} coins | Games played: {games}',
    de: 'Einsatz: {bet} Coins | Gespielte Runden: {games}',
    fr: 'Mise: {bet} pièces | Parties jouées: {games}',
    ru: 'Ставка: {bet} монет | Сыграно игр: {games}',
  },

  // ── CHALLENGE ────────────────────────────────────────────────────
  'economy.challenge.self': {
    en: 'You cannot challenge yourself.',
    de: 'Du kannst dich nicht selbst herausfordern.',
    fr: 'Vous ne pouvez pas vous défier vous-même.',
    ru: 'Нельзя бросать вызов самому себе.',
  },
  'economy.challenge.bot': {
    en: 'You cannot challenge a bot.',
    de: 'Du kannst keinen Bot herausfordern.',
    fr: 'Vous ne pouvez pas défier un bot.',
    ru: 'Нельзя бросать вызов боту.',
  },
  'economy.challenge.invalid_bet': {
    en: 'Invalid bet',
    de: 'Ungültiger Einsatz',
    fr: 'Mise invalide',
    ru: 'Неверная ставка',
  },
  'economy.challenge.pending_title': {
    en: 'Active challenge',
    de: 'Aktive Challenge',
    fr: 'Défi actif',
    ru: 'Активный вызов',
  },
  'economy.challenge.pending_desc': {
    en: 'One of you already has a pending challenge.',
    de: 'Einer von euch hat bereits eine ausstehende Challenge.',
    fr: 'L\'un de vous a déjà un défi en attente.',
    ru: 'У одного из вас уже есть активный вызов.',
  },
  'economy.challenge.title_bj': {
    en: '🃏 Challenge – Blackjack',
    de: '🃏 Challenge – Blackjack',
    fr: '🃏 Défi – Blackjack',
    ru: '🃏 Вызов – Блэкджек',
  },
  'economy.challenge.title_coinflip': {
    en: '🪙 Challenge – Coin Flip',
    de: '🪙 Challenge – Münzwurf',
    fr: '🪙 Défi – Pile ou Face',
    ru: '🪙 Вызов – Монетка',
  },
  'economy.challenge.desc': {
    en: '{challenger} challenges {opponent}!\n\n**Coins:** {bet} each\n**Winner takes:** {prize}\n\n⏱️ {opponent} has **{timeout}s** to accept.',
    de: '{challenger} fordert {opponent} heraus!\n\n**Coins:** {bet} pro Person\n**Gewinner erhält:** {prize}\n\n⏱️ {opponent} hat **{timeout}s** zum Annehmen.',
    fr: '{challenger} défie {opponent}!\n\n**Pièces:** {bet} chacun\n**Le gagnant prend:** {prize}\n\n⏱️ {opponent} a **{timeout}s** pour accepter.',
    ru: '{challenger} бросает вызов {opponent}!\n\n**Монеты:** {bet} каждый\n**Победитель получает:** {prize}\n\n⏱️ У {opponent} есть **{timeout}s** для принятия.',
  },
  'economy.challenge.accept': {
    en: 'Accept ✅',
    de: 'Annehmen ✅',
    fr: 'Accepter ✅',
    ru: 'Принять ✅',
  },
  'economy.challenge.decline': {
    en: 'Decline ❌',
    de: 'Ablehnen ❌',
    fr: 'Refuser ❌',
    ru: 'Отклонить ❌',
  },
  'economy.challenge.expired': {
    en: '⏱️ Challenge expired',
    de: '⏱️ Challenge abgelaufen',
    fr: '⏱️ Défi expiré',
    ru: '⏱️ Вызов истёк',
  },
  'economy.challenge.no_game': {
    en: 'No active game found.',
    de: 'Kein aktives Spiel gefunden.',
    fr: 'Aucune partie active trouvée.',
    ru: 'Активная игра не найдена.',
  },
  'economy.challenge.game_over': {
    en: 'This game is already over.',
    de: 'Dieses Spiel ist bereits beendet.',
    fr: 'Cette partie est déjà terminée.',
    ru: 'Эта игра уже завершена.',
  },
  'economy.challenge.not_challenger': {
    en: 'Only the challenged player can accept.',
    de: 'Nur der Herausgeforderte kann annehmen.',
    fr: 'Seul le joueur défié peut accepter.',
    ru: 'Только вызванный игрок может принять.',
  },
  'economy.challenge.not_challenged': {
    en: 'Only the challenged player can decline.',
    de: 'Nur der Herausgeforderte kann ablehnen.',
    fr: 'Seul le joueur défié peut refuser.',
    ru: 'Только вызванный игрок может отклонить.',
  },
  'economy.challenge.declined_title': {
    en: '🚫 Challenge declined',
    de: '🚫 Challenge abgelehnt',
    fr: '🚫 Défi refusé',
    ru: '🚫 Вызов отклонён',
  },
  'economy.challenge.declined_desc': {
    en: '{user} declined the challenge.\nStake ({bet}) has been refunded.',
    de: '{user} hat die Challenge abgelehnt.\nEinsatz ({bet}) wurde zurückerstattet.',
    fr: '{user} a refusé le défi.\nLa mise ({bet}) a été remboursée.',
    ru: '{user} отклонил вызов.\nСтавка ({bet}) возвращена.',
  },
  'economy.challenge.no_funds': {
    en: '{user} does not have enough coins.',
    de: '{user} hat nicht genug Coins.',
    fr: '{user} n\'a pas assez de pièces.',
    ru: 'У {user} недостаточно монет.',
  },

  // ── COIN FLIP ────────────────────────────────────────────────────
  'economy.coinflip.result_title': {
    en: '{emoji} Coin Flip – Result',
    de: '{emoji} Münzwurf – Ergebnis',
    fr: '{emoji} Pile ou Face – Résultat',
    ru: '{emoji} Монетка – Результат',
  },
  'economy.coinflip.heads': {
    en: '🌕 Heads',
    de: '🌕 Kopf',
    fr: '🌕 Face',
    ru: '🌕 Орёл',
  },
  'economy.coinflip.tails': {
    en: '🌑 Tails',
    de: '🌑 Zahl',
    fr: '🌑 Pile',
    ru: '🌑 Решка',
  },
  'economy.coinflip.winner': {
    en: '{side} – {winner} wins {amount}!',
    de: '{side} – {winner} gewinnt {amount}!',
    fr: '{side} – {winner} gagne {amount}!',
    ru: '{side} – {winner} выигрывает {amount}!',
  },
  'economy.coinflip.challenger_label': {
    en: '🎰 Challenger (Heads)',
    de: '🎰 Herausforderer (Kopf)',
    fr: '🎰 Challenger (Face)',
    ru: '🎰 Претендент (Орёл)',
  },
  'economy.coinflip.challenged_label': {
    en: '🎯 Challenged (Tails)',
    de: '🎯 Herausgeforderter (Zahl)',
    fr: '🎯 Défié (Pile)',
    ru: '🎯 Принявший (Решка)',
  },

  // ── BLACKJACK EMBED ──────────────────────────────────────────────
  'economy.bj.status.playing': {
    en: '🃏 Your Turn',
    de: '🃏 Dein Zug',
    fr: '🃏 Votre tour',
    ru: '🃏 Ваш ход',
  },
  'economy.bj.status.dealer_turn': {
    en: '🤖 Dealer draws...',
    de: '🤖 Dealer zieht...',
    fr: '🤖 Le croupier tire...',
    ru: '🤖 Дилер тянет...',
  },
  'economy.bj.status.player_bust': {
    en: '💥 Bust!',
    de: '💥 Überkauft!',
    fr: '💥 Dépassé!',
    ru: '💥 Перебор!',
  },
  'economy.bj.status.dealer_bust': {
    en: '🎉 Dealer busts!',
    de: '🎉 Dealer überkauft!',
    fr: '🎉 Le croupier dépasse!',
    ru: '🎉 У дилера перебор!',
  },
  'economy.bj.status.player_win': {
    en: '✅ You win!',
    de: '✅ Du gewinnst!',
    fr: '✅ Vous gagnez!',
    ru: '✅ Вы выигрываете!',
  },
  'economy.bj.status.dealer_win': {
    en: '❌ Dealer wins',
    de: '❌ Dealer gewinnt',
    fr: '❌ Le croupier gagne',
    ru: '❌ Дилер выигрывает',
  },
  'economy.bj.status.push': {
    en: '🤝 Push',
    de: '🤝 Unentschieden',
    fr: '🤝 Égalité',
    ru: '🤝 Ничья',
  },
  'economy.bj.status.player_bj': {
    en: '🃏🎰 BLACKJACK!',
    de: '🃏🎰 BLACKJACK!',
    fr: '🃏🎰 BLACKJACK!',
    ru: '🃏🎰 БЛЭКДЖЕК!',
  },
  'economy.bj.status.doubled_win': {
    en: '✅ Double Down – Win!',
    de: '✅ Double Down – Gewinn!',
    fr: '✅ Double Down – Gagné!',
    ru: '✅ Двойная ставка – Выигрыш!',
  },
  'economy.bj.status.doubled_loss': {
    en: '❌ Double Down – Loss',
    de: '❌ Double Down – Verlust',
    fr: '❌ Double Down – Perdu',
    ru: '❌ Двойная ставка – Проигрыш',
  },
  'economy.bj.your_hand': {
    en: '👤 Your Hand',
    de: '👤 Deine Hand',
    fr: '👤 Votre main',
    ru: '👤 Ваша рука',
  },
  'economy.bj.dealer': {
    en: '🤖 Dealer',
    de: '🤖 Dealer',
    fr: '🤖 Croupier',
    ru: '🤖 Дилер',
  },
  'economy.bj.value': {
    en: 'Value: **{total}**',
    de: 'Wert: **{total}**',
    fr: 'Valeur: **{total}**',
    ru: 'Значение: **{total}**',
  },
  'economy.bj.visible': {
    en: 'Visible: **{total}**',
    de: 'Sichtbar: **{total}**',
    fr: 'Visible: **{total}**',
    ru: 'Видимо: **{total}**',
  },
  'economy.bj.stake': {
    en: '💰 Stake',
    de: '💰 Einsatz',
    fr: '💰 Mise',
    ru: '💰 Ставка',
  },
  'economy.bj.result': {
    en: '🏆 Result',
    de: '🏆 Ergebnis',
    fr: '🏆 Résultat',
    ru: '🏆 Результат',
  },
  'economy.bj.push_result': {
    en: '🤝 Stake refunded',
    de: '🤝 Einsatz zurückerstattet',
    fr: '🤝 Mise remboursée',
    ru: '🤝 Ставка возвращена',
  },
  'economy.bj.pvp_title': {
    en: '🃏 PvP Blackjack – Result',
    de: '🃏 PvP Blackjack – Ergebnis',
    fr: '🃏 Blackjack PvP – Résultat',
    ru: '🃏 PvP Блэкджек – Результат',
  },
  'economy.bj.pvp_winner': {
    en: '{winner} wins with **{w}** against **{l}**!',
    de: '{winner} gewinnt mit **{w}** gegen **{l}**!',
    fr: '{winner} gagne avec **{w}** contre **{l}**!',
    ru: '{winner} побеждает с **{w}** против **{l}**!',
  },
  'economy.bj.pvp_draw': {
    en: 'Draw! (**{a}** vs **{b}**) – Stakes refunded.',
    de: 'Unentschieden! (**{a}** vs **{b}**) – Einsätze zurück.',
    fr: 'Égalité! (**{a}** vs **{b}**) – Mises remboursées.',
    ru: 'Ничья! (**{a}** vs **{b}**) – Ставки возвращены.',
  },

  // ═══════════════════════════════════════════════════════════════════
  // UTILITY – EMBED
  // ═══════════════════════════════════════════════════════════════════
  'utility.embed.modal_title': {
    en: '📝 Create Embed',
    de: '📝 Embed erstellen',
    fr: '📝 Créer un embed',
    ru: '📝 Создать embed',
  },
  'utility.embed.field_title': {
    en: 'Title',
    de: 'Titel',
    fr: 'Titre',
    ru: 'Заголовок',
  },
  'utility.embed.field_desc': {
    en: 'Description (line breaks supported)',
    de: 'Beschreibung (Zeilenumbrüche möglich)',
    fr: 'Description (sauts de ligne supportés)',
    ru: 'Описание (поддержка переносов строк)',
  },
  'utility.embed.desc_placeholder': {
    en: 'Write your text here...\nLine 2\nLine 3',
    de: 'Schreibe hier deinen Text...\nZeile 2\nZeile 3',
    fr: 'Écrivez votre texte ici...\nLigne 2\nLigne 3',
    ru: 'Напишите текст здесь...\nСтрока 2\nСтрока 3',
  },
  'utility.embed.field_color': {
    en: 'Color (hex, e.g. #5865f2)',
    de: 'Farbe (Hex, z.B. #5865f2)',
    fr: 'Couleur (hex, ex. #5865f2)',
    ru: 'Цвет (hex, напр. #5865f2)',
  },
  'utility.embed.field_footer': {
    en: 'Footer text (optional)',
    de: 'Footer-Text (optional)',
    fr: 'Texte de pied de page (optionnel)',
    ru: 'Текст подвала (необязательно)',
  },
  'utility.embed.invalid_color': {
    en: 'Invalid color. Please use a hex code like `#5865f2`.',
    de: 'Ungültige Farbe. Bitte nutze einen Hex-Code wie `#5865f2`.',
    fr: 'Couleur invalide. Utilisez un code hex comme `#5865f2`.',
    ru: 'Неверный цвет. Используйте hex-код, например `#5865f2`.',
  },
  'utility.embed.sent': {
    en: '✅ Embed sent to {channel}',
    de: '✅ Embed wurde in {channel} gesendet',
    fr: '✅ Embed envoyé dans {channel}',
    ru: '✅ Embed отправлен в {channel}',
  },

  // ═══════════════════════════════════════════════════════════════════
  // UTILITY – WEBHOOK
  // ═══════════════════════════════════════════════════════════════════
  'webhook.invalid_url': { en: 'Invalid webhook URL', de: 'Ungültige Webhook-URL', fr: 'URL de webhook invalide', ru: 'Неверный URL вебхука' },
  'webhook.invalid_url_desc': { en: 'Please provide a valid Discord webhook URL (https://discord.com/api/webhooks/...).', de: 'Bitte gib eine gültige Discord Webhook-URL an.', fr: 'Fournissez une URL de webhook Discord valide.', ru: 'Укажите корректный URL вебхука Discord.' },
  'webhook.invalid_timestamp': { en: 'Invalid timestamp', de: 'Ungültiger Zeitstempel', fr: 'Horodatage invalide', ru: 'Неверная метка времени' },
  'webhook.invalid_timestamp_desc': { en: 'Type `now`, or a valid ISO 8601 date like `2025-12-31T20:00:00Z`. Nothing from this screen was saved — reopen ✏️ Basic and try again.', de: 'Gib `now` ein, oder ein gültiges ISO-8601-Datum wie `2025-12-31T20:00:00Z`. Nichts von diesem Bildschirm wurde gespeichert — öffne ✏️ Basic erneut.', fr: 'Tapez `now`, ou une date ISO 8601 valide comme `2025-12-31T20:00:00Z`. Rien de cet écran n\'a été enregistré — rouvrez ✏️ Basic et réessayez.', ru: 'Введите `now` или корректную дату в формате ISO 8601, например `2025-12-31T20:00:00Z`. Ничего с этого экрана не сохранено — откройте ✏️ Basic заново.' },
  'webhook.saved': { en: '✅ Webhook saved', de: '✅ Webhook gespeichert', fr: '✅ Webhook sauvegardé', ru: '✅ Вебхук сохранён' },
  'webhook.saved_desc': { en: 'Saved as `{name}`. Use `/webhook send {name}`.', de: 'Gespeichert als `{name}`. Nutze `/webhook send {name}`.', fr: 'Sauvegardé sous `{name}`.', ru: 'Сохранён как `{name}`.' },
  'webhook.removed': { en: '✅ Webhook removed', de: '✅ Webhook entfernt', fr: '✅ Webhook supprimé', ru: '✅ Вебхук удалён' },
  'webhook.not_found': { en: 'Webhook not found', de: 'Webhook nicht gefunden', fr: 'Webhook introuvable', ru: 'Вебхук не найден' },
  'webhook.not_found_desc': { en: 'No webhook named `{name}`. Check `/webhook list`.', de: 'Kein Webhook `{name}`. Prüfe `/webhook list`.', fr: 'Aucun webhook `{name}`.', ru: 'Нет вебхука `{name}`.' },
  'webhook.list_title': { en: '🔗 Saved Webhooks', de: '🔗 Gespeicherte Webhooks', fr: '🔗 Webhooks sauvegardés', ru: '🔗 Сохранённые вебхуки' },
  'webhook.list_empty': { en: 'No webhooks saved', de: 'Keine Webhooks gespeichert', fr: 'Aucun webhook sauvegardé', ru: 'Вебхуки не сохранены' },
  'webhook.list_empty_desc': { en: 'Use `/webhook save <name> <url>` to add one.', de: 'Nutze `/webhook save <name> <url>`.', fr: 'Utilisez `/webhook save <nom> <url>`.', ru: 'Используйте `/webhook save <имя> <url>`.' },
  'webhook.bad_link': { en: 'Invalid message link', de: 'Ungültiger Nachrichtenlink', fr: 'Lien de message invalide', ru: 'Неверная ссылка на сообщение' },
  'webhook.sent': { en: '🚀 Message sent!', de: '🚀 Nachricht gesendet!', fr: '🚀 Message envoyé!', ru: '🚀 Сообщение отправлено!' },
  'webhook.edited': { en: '✏️ Message edited!', de: '✏️ Nachricht bearbeitet!', fr: '✏️ Message modifié!', ru: '✏️ Сообщение изменено!' },
  'webhook.deleted': { en: '🗑️ Message deleted!', de: '🗑️ Nachricht gelöscht!', fr: '🗑️ Message supprimé!', ru: '🗑️ Сообщение удалено!' },
  'webhook.error': { en: '❌ Webhook error', de: '❌ Webhook-Fehler', fr: '❌ Erreur webhook', ru: '❌ Ошибка вебхука' },
  'webhook.cancelled': { en: 'Cancelled', de: 'Abgebrochen', fr: 'Annulé', ru: 'Отменено' },
  'webhook.cancelled_desc': { en: 'Builder closed. No message was sent.', de: 'Builder geschlossen. Keine Nachricht gesendet.', fr: 'Constructeur fermé. Aucun message envoyé.', ru: 'Редактор закрыт. Сообщение не отправлено.' },
  'webhook.session_expired': { en: 'Session expired. Please run the command again.', de: 'Sitzung abgelaufen. Führe den Befehl erneut aus.', fr: 'Session expirée. Relancez la commande.', ru: 'Сессия истекла. Запустите команду снова.' },
  'webhook.section_saved': { en: '✅ Saved! Continue editing or click 🚀 to send.', de: '✅ Gespeichert! Weiter bearbeiten oder 🚀 senden.', fr: '✅ Sauvegardé! Continuez ou cliquez 🚀.', ru: '✅ Сохранено! Продолжайте или нажмите 🚀.' },
  'webhook.json_invalid': { en: 'Invalid JSON', de: 'Ungültiges JSON', fr: 'JSON invalide', ru: 'Неверный JSON' },
  'webhook.json_invalid_desc': { en: 'Could not parse JSON. Check for missing commas, brackets or quotes.', de: 'JSON konnte nicht geparst werden. Prüfe Kommas, Klammern, Anführungszeichen.', fr: 'Impossible d\'analyser le JSON.', ru: 'Не удалось разобрать JSON. Проверьте запятые и скобки.' },
  'webhook.preview_label': { en: '👁️ Preview', de: '👁️ Vorschau', fr: '👁️ Aperçu', ru: '👁️ Предпросмотр' },
  'webhook.preview_hint': { en: 'This is how your embed will look. Click 🚀 Send to publish.', de: 'So sieht dein Embed aus. Klicke 🚀 Senden zum Veröffentlichen.', fr: 'Aperçu de votre embed. Cliquez 🚀 Envoyer pour publier.', ru: 'Так выглядит ваш embed. Нажмите 🚀 Отправить для публикации.' },
  'webhook.builder_title': { en: '🚀 Webhook Builder', de: '🚀 Webhook-Builder', fr: '🚀 Constructeur Webhook', ru: '🚀 Редактор вебхука' },
  'webhook.builder_desc': { en: 'Build your message step by step using the buttons below.\n\n**✏️ Basic** — Title, description, color, timestamp\n**👤 Author** — Author name, URL, icon\n**🖼️ Images** — Thumbnail + large image\n**📄 Footer** — Footer text + icon\n**📋 Add Field** — Add an inline/block field\n**🤖 Sender** — Custom bot name + avatar\n**{ } JSON** — Import or paste raw JSON\n**👁️ Preview** — Preview before sending', de: 'Baue deine Nachricht mit den Buttons unten.\n\n**✏️ Basic** — Titel, Beschreibung, Farbe, Zeitstempel\n**👤 Autor** — Autorenname, URL, Icon\n**🖼️ Bilder** — Vorschaubild + großes Bild\n**📄 Footer** — Footertext + Icon\n**📋 Feld** — Feld hinzufügen\n**🤖 Absender** — Bot-Name + Avatar\n**{ } JSON** — JSON importieren\n**👁️ Vorschau** — Vorschau vor dem Senden', fr: 'Construisez votre message étape par étape.\n\n**✏️ Basic** — Titre, description, couleur, horodatage\n**👤 Auteur** — Nom, URL, icône\n**🖼️ Images** — Miniature + grande image\n**📄 Footer** — Texte + icône\n**📋 Champ** — Ajouter un champ\n**🤖 Expéditeur** — Nom + avatar\n**{ } JSON** — Importer JSON\n**👁️ Aperçu** — Aperçu avant envoi', ru: 'Создавайте сообщение шаг за шагом.\n\n**✏️ Основное** — Заголовок, описание, цвет, время\n**👤 Автор** — Имя, URL, иконка\n**🖼️ Изображения** — Миниатюра + большое фото\n**📄 Footer** — Текст + иконка\n**📋 Поле** — Добавить поле\n**🤖 Отправитель** — Имя + аватар\n**{ } JSON** — Импорт JSON\n**👁️ Предпросмотр** — Просмотр перед отправкой' },
  'webhook.builder_footer': { en: 'Session expires after 10 minutes of inactivity', de: 'Sitzung läuft nach 10 Minuten Inaktivität ab', fr: 'Session expire après 10 minutes d\'inactivité', ru: 'Сессия истекает через 10 минут' },
  'webhook.btn_basic': { en: 'Basic', de: 'Basic', fr: 'Basic', ru: 'Основное' },
  'webhook.btn_author': { en: 'Author', de: 'Autor', fr: 'Auteur', ru: 'Автор' },
  'webhook.btn_images': { en: 'Images', de: 'Bilder', fr: 'Images', ru: 'Изображения' },
  'webhook.btn_footer': { en: 'Footer', de: 'Footer', fr: 'Footer', ru: 'Footer' },
  'webhook.btn_field': { en: 'Add Field', de: 'Feld +', fr: 'Ajouter champ', ru: 'Поле +' },
  'webhook.btn_sender': { en: 'Sender', de: 'Absender', fr: 'Expéditeur', ru: 'Отправитель' },
  'webhook.btn_preview': { en: 'Preview', de: 'Vorschau', fr: 'Aperçu', ru: 'Предпросмотр' },
  'webhook.btn_send': { en: 'Send', de: 'Senden', fr: 'Envoyer', ru: 'Отправить' },
  'webhook.btn_cancel': { en: 'Cancel', de: 'Abbrechen', fr: 'Annuler', ru: 'Отмена' },
  'webhook.section_basic': { en: '✏️ Basic Settings', de: '✏️ Grundeinstellungen', fr: '✏️ Paramètres de base', ru: '✏️ Основные настройки' },
  'webhook.section_author': { en: '👤 Author', de: '👤 Autor', fr: '👤 Auteur', ru: '👤 Автор' },
  'webhook.section_images': { en: '🖼️ Images', de: '🖼️ Bilder', fr: '🖼️ Images', ru: '🖼️ Изображения' },
  'webhook.section_footer': { en: '📄 Footer', de: '📄 Footer', fr: '📄 Footer', ru: '📄 Footer' },
  'webhook.section_field': { en: '📋 Add Field', de: '📋 Feld hinzufügen', fr: '📋 Ajouter un champ', ru: '📋 Добавить поле' },
  'webhook.section_sender': { en: '🤖 Sender Settings', de: '🤖 Absender', fr: '🤖 Expéditeur', ru: '🤖 Отправитель' },
  'webhook.json_modal_send': { en: '{ } JSON — Send', de: '{ } JSON — Senden', fr: '{ } JSON — Envoyer', ru: '{ } JSON — Отправить' },
  'webhook.json_modal_edit': { en: '{ } JSON — Edit', de: '{ } JSON — Bearbeiten', fr: '{ } JSON — Modifier', ru: '{ } JSON — Изменить' },
  'webhook.json_label': { en: 'JSON payload (Discord webhook format)', de: 'JSON-Payload (Discord Webhook-Format)', fr: 'Payload JSON (format webhook Discord)', ru: 'JSON-payload (формат Discord вебхука)' },
  'webhook.input_title': { en: 'Embed title', de: 'Embed-Titel', fr: 'Titre embed', ru: 'Заголовок embed' },
  'webhook.input_desc': { en: 'Description (Enter = new line)', de: 'Beschreibung (Enter = neue Zeile)', fr: 'Description (Entrée = nouvelle ligne)', ru: 'Описание (Enter = новая строка)' },
  'webhook.input_color': { en: 'Color (hex, e.g. #5865f2)', de: 'Farbe (Hex, z.B. #5865f2)', fr: 'Couleur (hex, ex. #5865f2)', ru: 'Цвет (hex, напр. #5865f2)' },
  'webhook.input_title_url': { en: 'Title link URL (optional)', de: 'Titel-Link URL (optional)', fr: 'URL lien titre (optionnel)', ru: 'URL ссылки заголовка (необязательно)' },
  'webhook.input_timestamp': { en: 'Timestamp: "now" or ISO date', de: 'Zeitstempel: "now" oder ISO-Datum', fr: 'Horodatage: "now" ou date ISO', ru: 'Временная метка: "now" или ISO дата' },
  'webhook.input_author_name': { en: 'Author name', de: 'Autorenname', fr: 'Nom auteur', ru: 'Имя автора' },
  'webhook.input_author_url': { en: 'Author URL (optional)', de: 'Autoren-URL (optional)', fr: 'URL auteur (optionnel)', ru: 'URL автора (необязательно)' },
  'webhook.input_author_icon': { en: 'Author icon URL (optional)', de: 'Autoren-Icon URL (optional)', fr: 'URL icône auteur (optionnel)', ru: 'URL иконки автора (необязательно)' },
  'webhook.input_thumbnail': { en: 'Thumbnail URL (top-right)', de: 'Thumbnail-URL (oben rechts)', fr: 'URL miniature (en haut à droite)', ru: 'URL миниатюры (вверху справа)' },
  'webhook.input_image': { en: 'Large image URL (bottom)', de: 'Großes Bild-URL (unten)', fr: 'URL grande image (en bas)', ru: 'URL большого изображения (внизу)' },
  'webhook.input_footer_text': { en: 'Footer text', de: 'Footertext', fr: 'Texte footer', ru: 'Текст footer' },
  'webhook.input_footer_icon': { en: 'Footer icon URL (optional)', de: 'Footer-Icon URL (optional)', fr: 'URL icône footer (optionnel)', ru: 'URL иконки footer (необязательно)' },
  'webhook.input_field_name': { en: 'Field name / title', de: 'Feldname / Titel', fr: 'Nom / titre du champ', ru: 'Название поля' },
  'webhook.input_field_value': { en: 'Field content', de: 'Feldinhalt', fr: 'Contenu du champ', ru: 'Содержимое поля' },
  'webhook.input_field_inline': { en: 'Inline? (yes / no)', de: 'Inline? (yes / no)', fr: 'Inline? (yes / no)', ru: 'Строчное? (yes / no)' },
  'webhook.input_sender_name': { en: 'Custom bot username', de: 'Bot-Benutzername', fr: 'Nom du bot personnalisé', ru: 'Имя бота' },
  'webhook.input_sender_avatar': { en: 'Custom avatar URL', de: 'Avatar-URL', fr: 'URL avatar', ru: 'URL аватара' },

  // ── Webhook wizard main menu ──────────────────────────────────────────
  'webhook.main_title': { en: '🪝 Webhook Manager', de: '🪝 Webhook-Verwaltung', fr: '🪝 Gestion des webhooks', ru: '🪝 Управление вебхуками' },
  'webhook.main_desc': { en: 'Manage saved webhooks, send messages, or edit/delete existing ones — everything in one place.', de: 'Gespeicherte Webhooks verwalten, Nachrichten senden oder bestehende bearbeiten/löschen — alles an einem Ort.', fr: 'Gérez les webhooks enregistrés, envoyez des messages, ou modifiez/supprimez les existants.', ru: 'Управляйте сохранёнными вебхуками, отправляйте сообщения или редактируйте/удаляйте существующие.' },
  'webhook.menu_manage': { en: 'Saved Webhooks', de: 'Gespeicherte Webhooks', fr: 'Webhooks enregistrés', ru: 'Сохранённые вебхуки' },
  'webhook.menu_send': { en: 'Send Message', de: 'Nachricht senden', fr: 'Envoyer un message', ru: 'Отправить сообщение' },
  'webhook.menu_json': { en: 'Send Raw JSON', de: 'JSON senden', fr: 'Envoyer du JSON', ru: 'Отправить JSON' },
  'webhook.menu_edit': { en: 'Edit Message', de: 'Nachricht bearbeiten', fr: 'Modifier un message', ru: 'Редактировать сообщение' },
  'webhook.menu_delete': { en: 'Delete Message', de: 'Nachricht löschen', fr: 'Supprimer un message', ru: 'Удалить сообщение' },
  'webhook.btn_back': { en: '🔙 Back', de: '🔙 Zurück', fr: '🔙 Retour', ru: '🔙 Назад' },
  'webhook.btn_add': { en: '➕ Add Webhook', de: '➕ Webhook hinzufügen', fr: '➕ Ajouter un webhook', ru: '➕ Добавить вебхук' },

  'webhook.manage_title': { en: '💾 Saved Webhooks', de: '💾 Gespeicherte Webhooks', fr: '💾 Webhooks enregistrés', ru: '💾 Сохранённые вебхуки' },
  'webhook.manage_desc': { en: 'Select one to remove it, or add a new one.', de: 'Zum Entfernen auswählen, oder einen neuen hinzufügen.', fr: 'Sélectionnez-en un pour le supprimer, ou ajoutez-en un nouveau.', ru: 'Выберите, чтобы удалить, или добавьте новый.' },
  'webhook.manage_empty': { en: 'No webhooks saved yet.', de: 'Noch keine Webhooks gespeichert.', fr: 'Aucun webhook enregistré.', ru: 'Пока нет сохранённых вебхуков.' },
  'webhook.manage_pick_placeholder': { en: 'Select a webhook to remove…', de: 'Webhook zum Entfernen wählen…', fr: 'Sélectionner un webhook à supprimer…', ru: 'Выберите вебхук для удаления…' },

  'webhook.add_modal_title': { en: 'Add Webhook', de: 'Webhook hinzufügen', fr: 'Ajouter un webhook', ru: 'Добавить вебхук' },
  'webhook.add_name_label': { en: 'Short name (e.g. "announcements")', de: 'Kurzname (z.B. "ankuendigungen")', fr: 'Nom court (ex. "annonces")', ru: 'Короткое имя (напр. "объявления")' },
  'webhook.add_url_label': { en: 'Discord webhook URL', de: 'Discord Webhook-URL', fr: 'URL du webhook Discord', ru: 'URL вебхука Discord' },

  'webhook.pick_title': { en: '🎯 Choose a Webhook', de: '🎯 Webhook wählen', fr: '🎯 Choisir un webhook', ru: '🎯 Выберите вебхук' },
  'webhook.pick_desc': { en: 'Pick a saved webhook, or enter a URL directly.', de: 'Gespeicherten Webhook wählen, oder eine URL direkt eingeben.', fr: 'Choisissez un webhook enregistré, ou entrez une URL directement.', ru: 'Выберите сохранённый вебхук или введите URL напрямую.' },
  'webhook.pick_placeholder': { en: 'Select a saved webhook…', de: 'Gespeicherten Webhook wählen…', fr: 'Sélectionner un webhook enregistré…', ru: 'Выберите сохранённый вебхук…' },
  'webhook.pick_custom_url': { en: '🔗 Enter URL Directly', de: '🔗 URL direkt eingeben', fr: '🔗 Entrer une URL', ru: '🔗 Ввести URL' },
  'webhook.pick_none_saved': { en: 'No saved webhooks — enter a URL directly instead.', de: 'Keine gespeicherten Webhooks — gib stattdessen eine URL direkt ein.', fr: 'Aucun webhook enregistré — entrez une URL directement.', ru: 'Нет сохранённых вебхуков — введите URL напрямую.' },

  'webhook.custom_url_modal_title': { en: 'Enter Webhook URL', de: 'Webhook-URL eingeben', fr: 'Entrer l’URL du webhook', ru: 'Введите URL вебхука' },
  'webhook.custom_url_label': { en: 'Discord webhook URL', de: 'Discord Webhook-URL', fr: 'URL du webhook Discord', ru: 'URL вебхука Discord' },

  'webhook.msglink_modal_title': { en: 'Message Link', de: 'Nachrichten-Link', fr: 'Lien du message', ru: 'Ссылка на сообщение' },
  'webhook.msglink_label': { en: 'Discord message link (right-click → Copy Message Link)', de: 'Discord-Nachrichtenlink (Rechtsklick → Link kopieren)', fr: 'Lien du message Discord (clic droit → Copier le lien)', ru: 'Ссылка на сообщение Discord (ПКМ → Копировать ссылку)' },

  'webhook.btn_content': { en: 'Message Text', de: 'Nachrichtentext', fr: 'Texte du message', ru: 'Текст сообщения' },
  'webhook.input_content': { en: 'Plain message text (shown above the embed, if any). Line breaks are kept exactly as typed.', de: 'Klartext-Nachricht (über dem Embed angezeigt, falls vorhanden). Zeilenumbrüche/Absätze bleiben exakt wie eingegeben erhalten.', fr: 'Texte brut du message (affiché au-dessus de l’embed). Les retours à la ligne sont conservés tels quels.', ru: 'Обычный текст сообщения (отображается над embed). Переносы строк сохраняются как есть.' },

  // ═══════════════════════════════════════════════════════════════════
  // STATS TEMPLATES (Voice-Channel-Namen)
  // ═══════════════════════════════════════════════════════════════════
  'stats.template.total': {
    en: '👥 Members: {value}',
    de: '👥 Mitglieder: {value}',
    fr: '👥 Membres: {value}',
    ru: '👥 Участники: {value}',
  },
  'stats.template.humans': {
    en: '🧑 Humans: {value}',
    de: '🧑 Menschen: {value}',
    fr: '🧑 Humains: {value}',
    ru: '🧑 Люди: {value}',
  },
  'stats.template.bots': {
    en: '🤖 Bots: {value}',
    de: '🤖 Bots: {value}',
    fr: '🤖 Bots: {value}',
    ru: '🤖 Боты: {value}',
  },
  'stats.template.online': {
    en: '🟢 Online: {value}',
    de: '🟢 Online: {value}',
    fr: '🟢 En ligne: {value}',
    ru: '🟢 Онлайн: {value}',
  },
  'stats.template.boosts': {
    en: '🚀 Boosts: {value}',
    de: '🚀 Boosts: {value}',
    fr: '🚀 Boosts: {value}',
    ru: '🚀 Бусты: {value}',
  },
  'stats.template.boost_level': {
    en: '⭐ Boost Level: {value}',
    de: '⭐ Boost-Level: {value}',
    fr: '⭐ Niveau Boost: {value}',
    ru: '⭐ Уровень буста: {value}',
  },
  'stats.template.role': {
    en: '🎭 {role}: {value}',
    de: '🎭 {role}: {value}',
    fr: '🎭 {role}: {value}',
    ru: '🎭 {role}: {value}',
  },
  'stats.reload': {
    en: '🔄 Stats reloaded',
    de: '🔄 Stats neu geladen',
    fr: '🔄 Stats rechargées',
    ru: '🔄 Статистика обновлена',
  },
  'stats.reload_desc': {
    en: 'All stat channels updated to the new language.',
    de: 'Alle Stat-Kanäle wurden in die neue Sprache übersetzt.',
    fr: 'Tous les canaux de stats ont été mis à jour dans la nouvelle langue.',
    ru: 'Все каналы статистики обновлены на новый язык.',
  },
  'language.reload_hint': {
    en: 'Stat channels will update automatically.',
    de: 'Stat-Kanäle werden automatisch aktualisiert.',
    fr: 'Les canaux de stats seront mis à jour automatiquement.',
    ru: 'Каналы статистики обновятся автоматически.',
  },

  'ticket.support_team': { en: '👥 Support Team', de: '👥 Support-Team', fr: '👥 Équipe support', ru: '👥 Команда поддержки' },
  'ticket.select_placeholder': { en: 'Select a category to open a ticket...', de: 'Wähle eine Kategorie um ein Ticket zu öffnen...', fr: 'Sélectionnez une catégorie pour ouvrir un ticket...', ru: 'Выберите категорию для открытия тикета...' },
  'ticket.faq_desc': { en: 'Please check if your question is already answered below before opening a ticket.', de: 'Bitte prüfe ob deine Frage bereits beantwortet wurde, bevor du ein Ticket öffnest.', fr: 'Veuillez vérifier si votre question est déjà répondue avant d\'ouvrir un ticket.', ru: 'Пожалуйста, проверьте, не отвечено ли уже на ваш вопрос, прежде чем открывать тикет.' },
  'ticket.faq_open_anyway': { en: 'Open a ticket anyway', de: 'Trotzdem Ticket öffnen', fr: 'Ouvrir un ticket quand même', ru: 'Открыть тикет всё равно' },
  'ticket.faq_cancel': { en: 'Cancel', de: 'Abbrechen', fr: 'Annuler', ru: 'Отмена' },
  'ticket.reason_label': { en: 'Reason for opening this ticket', de: 'Grund für dieses Ticket', fr: 'Raison de l\'ouverture du ticket', ru: 'Причина открытия тикета' },
  'ticket.reason_placeholder': { en: 'Describe your issue or question (min. 10 characters)...', de: 'Beschreibe dein Anliegen (min. 10 Zeichen)...', fr: 'Décrivez votre demande (min. 10 caractères)...', ru: 'Опишите ваш вопрос (мин. 10 символов)...' },
  'ticket.spam_title': { en: '⏳ Slow down', de: '⏳ Bitte warten', fr: '⏳ Doucement', ru: '⏳ Помедленнее' },
  'ticket.spam_cooldown': { en: 'You can open another ticket in **{seconds}s**.', de: 'Du kannst in **{seconds}s** ein neues Ticket öffnen.', fr: 'Vous pouvez ouvrir un nouveau ticket dans **{seconds}s**.', ru: 'Вы сможете открыть новый тикет через **{seconds}s**.' },
  'ticket.spam_limit': { en: 'You already have **{count}** open tickets. Please close some before opening a new one.', de: 'Du hast bereits **{count}** offene Tickets. Bitte schließe einige bevor du ein neues öffnest.', fr: 'Vous avez déjà **{count}** tickets ouverts. Veuillez en fermer avant d\'en ouvrir un nouveau.', ru: 'У вас уже **{count}** открытых тикетов. Закройте несколько перед открытием нового.' },

  // ═══════════════════════════════════════════════════════════════════
  'ticket.created': {
    en: '🎫 Ticket Created',
    de: '🎫 Ticket erstellt',
    fr: '🎫 Ticket créé',
    ru: '🎫 Билет создан',
  },
  'ticket.closed': {
    en: '🎫 Ticket Closed',
    de: '🎫 Ticket geschlossen',
    fr: '🎫 Ticket fermé',
    ru: '🎫 Билет закрыт',
  },
  'ticket.number': {
    en: 'Ticket #{number}',
    de: 'Ticket #{number}',
    fr: 'Ticket #{number}',
    ru: 'Билет #{number}',
  },
  'ticket.opened_by': {
    en: 'Opened by {user}',
    de: 'Geöffnet von {user}',
    fr: 'Ouvert par {user}',
    ru: 'Открыт {user}',
  },
  'ticket.close_button': {
    en: 'Close Ticket',
    de: 'Ticket schließen',
    fr: 'Fermer le ticket',
    ru: 'Закрыть билет',
  },
  'ticket.transcript': {
    en: 'Transcript',
    de: 'Mitschrift',
    fr: 'Transcription',
    ru: 'Стенограмма',
  },

  // ═══════════════════════════════════════════════════════════════════
  // GIVEAWAY SYSTEM
  // ═══════════════════════════════════════════════════════════════════
  'giveaway.started': {
    en: '🎉 Giveaway Started!',
    de: '🎉 Gewinnspiel gestartet!',
    fr: '🎉 Concours commencé!',
    ru: '🎉 Конкурс начался!',
  },
  'giveaway.ended': {
    en: '🎉 Giveaway Ended!',
    de: '🎉 Gewinnspiel beendet!',
    fr: '🎉 Concours terminé!',
    ru: '🎉 Конкурс завершен!',
  },
  'giveaway.prize': {
    en: 'Prize',
    de: 'Preis',
    fr: 'Prix',
    ru: 'Приз',
  },
  'giveaway.winners': {
    en: 'Winners',
    de: 'Gewinner',
    fr: 'Gagnants',
    ru: 'Победители',
  },
  'giveaway.host': {
    en: 'Hosted by',
    de: 'Gehostet von',
    fr: 'Hébergé par',
    ru: 'Проводится',
  },
  'giveaway.react': {
    en: 'React with 🎉 to enter!',
    de: 'Reagiere mit 🎉 um teilzunehmen!',
    fr: 'Réagissez avec 🎉 pour entrer!',
    ru: 'Реагируйте с 🎉 чтобы участвовать!',
  },
  'giveaway.ends_in': {
    en: 'Ends in {time}',
    de: 'Endet in {time}',
    fr: 'Se termine dans {time}',
    ru: 'Заканчивается через {time}',
  },

  // ═══════════════════════════════════════════════════════════════════
  // VERIFICATION & WELCOME
  // ═══════════════════════════════════════════════════════════════════
  'verify.title': {
    en: '✅ Verification',
    de: '✅ Verifizierung',
    fr: '✅ Vérification',
    ru: '✅ Проверка',
  },
  'verify.welcome': {
    en: 'Welcome to {server}!',
    de: 'Willkommen auf {server}!',
    fr: 'Bienvenue sur {server}!',
    ru: 'Добро пожаловать на {server}!',
  },
  'verify.verify_button': {
    en: 'Verify',
    de: 'Verifizieren',
    fr: 'Vérifier',
    ru: 'Проверить',
  },
  'verify.verified': {
    en: '✅ {user} has been verified',
    de: '✅ {user} wurde verifiziert',
    fr: '✅ {user} a été vérifié',
    ru: '✅ {user} был проверен',
  },

  // ═══════════════════════════════════════════════════════════════════
  // GAMES
  // ═══════════════════════════════════════════════════════════════════
  'game.rps': {
    en: 'Rock Paper Scissors',
    de: 'Stein Papier Schere',
    fr: 'Pierre Papier Ciseaux',
    ru: 'Камень Бумага Ножницы',
  },
  'game.dice': {
    en: 'Dice Roll',
    de: 'Würfelwurf',
    fr: 'Lancer de dés',
    ru: 'Бросок костей',
  },
  'game.tictactoe': {
    en: 'Tic Tac Toe',
    de: 'Tic Tac Toe',
    fr: 'Tic Tac Toe',
    ru: 'Крестики-нолики',
  },
  'game.numguess': {
    en: 'Number Guessing',
    de: 'Zahlenschätzen',
    fr: 'Deviner le nombre',
    ru: 'Угадай число',
  },
  'game.hangman': {
    en: 'Hangman',
    de: 'Galgenspiel',
    fr: 'Pendu',
    ru: 'Виселица',
  },
  'game.won': {
    en: '🎉 {user} won!',
    de: '🎉 {user} gewonnen!',
    fr: '🎉 {user} a gagné!',
    ru: '🎉 {user} выиграл!',
  },
  'game.lost': {
    en: '😢 {user} lost',
    de: '😢 {user} verloren',
    fr: '😢 {user} perdu',
    ru: '😢 {user} проиграл',
  },


  // ═══════════════════════════════════════════════════════════════════
  // NEW BOARD GAMES
  // ═══════════════════════════════════════════════════════════════════
  'game.chess': { en:'Chess', de:'Schach', fr:'Échecs', ru:'Шахматы' },
  'game.chess.desc': { en:'Play Chess against AI or challenge a player. Use `/chess move from:e2 to:e4` to move.', de:'Schach gegen KI oder einen Spieler. Benutze `/chess move from:e2 to:e4` zum Ziehen.', fr:'Jouer aux échecs contre l\'IA ou un joueur.', ru:'Играть в шахматы против ИИ или игрока.' },
  'game.battleship': { en:'Battleship', de:'Schiffe versenken', fr:'Bataille navale', ru:'Морской бой' },
  'game.battleship.desc': { en:'10×10 grid, 5 ships. Click coordinates to shoot. Sink all enemy ships to win!', de:'10×10 Raster, 5 Schiffe. Klicke Koordinaten zum Schießen. Versenke alle Schiffe!', fr:'Grille 10×10, 5 navires. Coulez tous les navires ennemis!', ru:'Поле 10×10, 5 кораблей. Потопите все вражеские корабли!' },
  'game.yahtzee': { en:'Yahtzee', de:'Yahtzee', fr:'Yahtzee', ru:'Яхтзи' },
  'game.yahtzee.desc': { en:'Roll 5 dice, hold keepers, score 13 categories. Bonus +35 pts if upper section ≥ 63.', de:'5 Würfel werfen, halten, 13 Kategorien werten. Bonus +35 Pkt bei Oberteil ≥ 63.', fr:'Lancez 5 dés, gardez-en, marquez 13 catégories.', ru:'Бросайте 5 кубиков, выбирайте категории для очков.' },
  'game.uno': { en:'UNO', de:'UNO', fr:'UNO', ru:'УНО' },
  'game.uno.desc': { en:'Classic UNO for 2-4 players. Match color or number — last card wins! Special cards: Skip, Reverse, +2, Wild, +4.', de:'Klassisches UNO für 2-4 Spieler. Farbe oder Zahl matchen — letztes Karte gewinnt!', fr:'UNO classique pour 2-4 joueurs.', ru:'Классическое UНО для 2-4 игроков.' },
  'game.chess.check': { en:'⚠️ Check!', de:'⚠️ Schach!', fr:'⚠️ Échec!', ru:'⚠️ Шах!' },
  'game.chess.checkmate': { en:'Checkmate!', de:'Schachmatt!', fr:'Échec et mat!', ru:'Шах и мат!' },
  'game.chess.stalemate': { en:'Stalemate — draw!', de:'Patt — Unentschieden!', fr:'Pat — match nul!', ru:'Пат — ничья!' },
  'game.chess.resign': { en:'Resignation', de:'Aufgabe', fr:'Abandon', ru:'Сдача' },
  'game.bs.hit': { en:'🔥 Hit!', de:'🔥 Treffer!', fr:'🔥 Touché!', ru:'🔥 Попал!' },
  'game.bs.miss': { en:'💨 Miss!', de:'💨 Vorbei!', fr:'💨 Manqué!', ru:'💨 Мимо!' },
  'game.bs.sunk': { en:'💥 Sunk!', de:'💥 Versenkt!', fr:'💥 Coulé!', ru:'💥 Потоплен!' },
  'game.uno.notYourTurn': { en:'Not your turn!', de:'Du bist nicht dran!', fr:'Ce n\'est pas votre tour!', ru:'Не ваша очередь!' },
  'game.uno.cannotPlay': { en:'Cannot play that card.', de:'Diese Karte kann nicht gespielt werden.', fr:'Impossible de jouer cette carte.', ru:'Нельзя сыграть эту карту.' },


  // New party & board games
  'game.higherorlower': { en:'Higher or Lower', de:'Höher oder Tiefer', fr:'Plus ou Moins', ru:'Выше или Ниже' },
  'guide.higherorlower': { en:'**🃏 Higher or Lower Guide**\n\n**How to play:**\n1. A card is shown\n2. Guess if the next card is **Higher ⬆️** or **Lower ⬇️**\n3. Equal = loss (house edge)\n4. Build a streak for a multiplier!\n\n**Streak multipliers:**\n3 streak = ×2 | 5 = ×3 | 7 = ×4 | 10 = ×5\n\n**Cash out** anytime after your first win to keep your coins!\n\n**Commands:**\n`/higherorlower` — free\n`/higherorlower bet:500` — bet coins, multiplied by streak!', de:'**🃏 Höher oder Tiefer Anleitung**\n\nKarte wird gezeigt → Höher oder Tiefer raten. Gleich = Verlust. Streak = höhere Multiplikatoren!', fr:'**🃏 Guide Plus ou Moins**\n\nUne carte est montrée, devinez si la suivante est plus haute ou plus basse!', ru:'**🃏 Выше или Ниже**\n\nПоказывается карта — угадайте выше или ниже следующая!' },
  'game.truthordare':    { en:'Truth or Dare',        de:'Wahrheit oder Pflicht', fr:'Action ou Vérité',    ru:'Правда или действие' },
  'game.wouldyourather': { en:'Would You Rather',     de:'Lieber... oder...?',    fr:'Tu préfères...',      ru:'Что лучше...' },
  'game.ghostsagainst':  { en:'Ghosts Against Discord',de:'Geister gegen Discord', fr:'Fantômes contre Discord', ru:'Призраки против Discord' },
  'game.memelord':       { en:'Memelord',              de:'Memelord',              fr:'Seigneur des mèmes',  ru:'Мем-лорд' },
  'game.guesssong':      { en:'Guess the Song',        de:'Errate den Song',       fr:'Devine la chanson',   ru:'Угадай песню' },
  'game.mastermind':     { en:'Mastermind',             de:'Mastermind',            fr:'Mastermind',          ru:'Мастермайнд' },
  'game.connectfour.variants': { en:'Variants: Classic · Large · Chess960 · Connectris', de:'Varianten: Klassisch · Groß · Chess960 · Connectris', fr:'Variantes: Classique · Grand · Chess960 · Connectris', ru:'Варианты: Классика · Большой · Chess960 · Коннектрис' },



  // ── PvP Challenge negotiation ───────────────────────────────────────────────
  'challenge.title':      { en:'{game} — Challenge!',        de:'{game} — Herausforderung!',    fr:'{game} — Défi!',               ru:'{game} — Вызов!' },
  'challenge.proposed':   { en:'Proposed bet: 🪙 {bet} each',de:'Vorgeschlagener Einsatz: 🪙 {bet} jeder',fr:'Mise proposée: 🪙 {bet} chacun',ru:'Предложенная ставка: 🪙 {bet} каждый' },
  'challenge.prizePool':  { en:'Prize pool: 🪙 {pot}',       de:'Preispool: 🪙 {pot}',           fr:'Cagnotte: 🪙 {pot}',            ru:'Призовой фонд: 🪙 {pot}' },
  'challenge.nobet':      { en:'Free game — no bet',         de:'Kostenloses Spiel — kein Einsatz',fr:'Jeu gratuit — sans mise',     ru:'Бесплатная игра — без ставки' },
  'challenge.counterBtn': { en:'💬 Counter-offer',           de:'💬 Gegenangebot',               fr:'💬 Contre-offre',               ru:'💬 Встречное предложение' },
  'challenge.counterDesc':{ en:'The lower amount wins — bet less to reduce risk.', de:'Der niedrigere Betrag gewinnt — weniger setzen = weniger Risiko.', fr:'Le montant le plus bas l\'emporte.', ru:'Меньшая сумма побеждает — ставьте меньше для меньшего риска.' },
  'challenge.dealAgreed': { en:'Deal agreed!',               de:'Einigung erzielt!',             fr:'Accord conclu!',                ru:'Договорились!' },
  'challenge.footerHint':  { en:'Lower bet always wins — if you offer less, that becomes the final amount.', de:'Niedrigerer Einsatz gewinnt immer — wer weniger bietet, der setzt diesen Betrag.', fr:'La mise la plus basse l\'emporte — si vous offrez moins, c\'est le montant final.', ru:'Меньшая ставка всегда побеждает — предложите меньше, и это станет финальной суммой.' },
  'challenge.pickAmount':  { en:'Choose your bet amount', de:'Wähle deinen Einsatz', fr:'Choisissez votre mise', ru:'Выберите размер ставки' },
  'challenge.counterHow':  { en:'Choose how much YOU want to bet.', de:'Wähle wie viel DU setzen möchtest.', fr:'Choisissez combien VOUS voulez miser.', ru:'Выберите сколько ВЫ хотите поставить.' },
  'challenge.finalBet':   { en:'Final bet: 🪙 {bet} each — Winner gets 🪙 {pot}', de:'Finaler Einsatz: 🪙 {bet} jeder — Gewinner bekommt 🪙 {pot}', fr:'Mise finale: 🪙 {bet} chacun — Gagnant reçoit 🪙 {pot}', ru:'Финальная ставка: 🪙 {bet} каждый — Победитель получает 🪙 {pot}' },

  // ── Game common strings (all 4 languages) ──────────────────────────────────

  'game.notYourGame':    { en:'Not your game!',      de:'Nicht dein Spiel!',     fr:'Ce n\'est pas votre jeu!', ru:'Это не ваша игра!' },
  'game.alreadyAnswered':{ en:'Already answered!',   de:'Bereits beantwortet!',  fr:'Déjà répondu!',             ru:'Уже ответили!' },
  'game.alreadyShot':    { en:'Already shot there!', de:'Schon geschossen!',     fr:'Déjà tiré là!',             ru:'Уже стреляли!' },
  'game.notYourTurn':   { en:'Not your turn!',          de:'Du bist nicht dran!',      fr:'Ce n\'est pas votre tour!', ru:'Не ваша очередь!' },
  'game.invalidOpp':    { en:'Invalid opponent.',        de:'Ungültiger Gegner.',        fr:'Adversaire invalide.',       ru:'Неверный противник.' },
  'game.noCoins':       { en:'❌ Insufficient coins.',   de:'❌ Nicht genug Münzen.',   fr:'❌ Pièces insuffisantes.',   ru:'❌ Недостаточно монет.' },
  'game.expired':       { en:'Game expired.',            de:'Spiel abgelaufen.',         fr:'Partie expirée.',            ru:'Игра истекла.' },
  'game.betsRefunded':  { en:'Bets refunded.',           de:'Einsätze zurückerstattet.', fr:'Mises remboursées.',         ru:'Ставки возвращены.' },
  'game.betEach':       { en:'🪙 {n} coins each',        de:'🪙 {n} Münzen jeder',       fr:'🪙 {n} pièces chacun',       ru:'🪙 {n} монет каждый' },
  'game.winCoins':      { en:'🪙 +{n} coins!',           de:'🪙 +{n} Münzen!',           fr:'🪙 +{n} pièces!',            ru:'🪙 +{n} монет!' },
  'game.loseCoins':     { en:'🪙 -{n} coins.',           de:'🪙 -{n} Münzen.',           fr:'🪙 -{n} pièces.',            ru:'🪙 -{n} монет.' },
  'game.draw':          { en:'🤝 Draw!',                 de:'🤝 Unentschieden!',         fr:'🤝 Égalité!',                ru:'🤝 Ничья!' },
  'game.challengeSent': { en:'{user} challenged {opp}!',de:'{user} fordert {opp} heraus!',fr:'{user} défie {opp}!',    ru:'{user} вызывает {opp}!' },
  'game.accept':        { en:'Accept ✅',                de:'Annehmen ✅',               fr:'Accepter ✅',                ru:'Принять ✅' },
  'game.decline':       { en:'Decline ❌',               de:'Ablehnen ❌',               fr:'Refuser ❌',                 ru:'Отклонить ❌' },
  'game.declined':      { en:'{user} declined.',         de:'{user} hat abgelehnt.',     fr:'{user} a refusé.',           ru:'{user} отклонил.' },
  'game.resign':        { en:'🏳 Resign',                de:'🏳 Aufgeben',               fr:'🏳 Abandonner',              ru:'🏳 Сдаться' },

  // ── Guide strings ───────────────────────────────────────────────────────────
  'guide.chess':       { en:'**♟️ Chess Guide**\n\n**How to play:**\nSelect a piece from the dropdown → select the target square. All standard rules apply: castling, en passant, promotion, check & checkmate.\n\n**Commands:**\n`/chess pve` — vs AI\n`/chess pvp @user` — vs Player\n\n**Variants:** Standard · Chess960 (random start position)\n\n**Economy:** Add `bet:` to wager coins. Winner takes all!', de:'**♟️ Schach Anleitung**\n\nFigur im Dropdown wählen → Zielfeld wählen. Alle Standardregeln gelten.\n\n`/chess pve` — gegen KI | `/chess pvp @user` — gegen Spieler', fr:'**♟️ Guide Échecs**\n\nSélectionnez une pièce → sélectionnez la case cible. Toutes les règles standard s\'appliquent.', ru:'**♟️ Руководство Шахматы**\n\nВыберите фигуру → выберите целевую клетку.' },
  'guide.battleship':  { en:'**🎯 Battleship Guide**\n\n**How to play:**\n1. Place your 5 ships (or random)\n2. Take turns shooting coordinates\n3. 💥=Hit, 〰️=Miss\n4. Sink all enemy ships to win!\n\n**Ships:** Carrier(5) Battleship(4) Cruiser(3) Submarine(3) Destroyer(2)\n\n**Commands:**\n`/battleship pve` — vs AI\n`/battleship pvp @user` — vs Player\n\n**Economy:** Add `bet:` to wager coins!', de:'**🎯 Schiffe versenken Anleitung**\n\n1. Schiffe platzieren\n2. Koordinaten schießen\n3. Alle Schiffe versenken = Sieg!', fr:'**🎯 Guide Bataille Navale**\n\nPlacez vos navires, tirez des coordonnées, coulez tous les navires ennemis!', ru:'**🎯 Морской бой**\n\nРазместите корабли, стреляйте по координатам, потопите все!' },
  'guide.connectfour': { en:'**🔴🟡 Connect Four Guide**\n\n**How to play:**\nDrop pieces by clicking column buttons. Get 4 in a row (horizontal, vertical, or diagonal) to win!\n\n**Variants:**\n• Classic — standard 6×7\n• Large — 8×9 board\n• Chess960 — shuffled column order\n• Connectris — full rows clear automatically\n\n**Commands:**\n`/connectfour pvp @user` — vs Player\n`/connectfour pve` — vs AI\n\n**Economy:** Add `bet:` to wager coins!', de:'**🔴🟡 Vier Gewinnt Anleitung**\n\n4 in eine Reihe = Sieg! Horizontal, vertikal oder diagonal.\n\nVarianten: Classic · Groß · Chess960 · Connectris', fr:'**🔴🟡 Guide Puissance 4**\n\n4 d\'affilée pour gagner! Horizontal, vertical ou diagonal.', ru:'**🔴🟡 Четыре в ряд**\n\n4 подряд = победа! По горизонтали, вертикали или диагонали.' },
  'guide.yahtzee':     { en:'**🎲 Yahtzee Guide**\n\n**How to play:**\n1. Roll 5 dice (up to 3 rolls per turn)\n2. Toggle dice to hold between rolls\n3. Score in one of 13 categories\n4. Upper section bonus: +35 pts if total ≥ 63\n\n**Top scores:** Yahtzee=50, Large Straight=40, Small Straight=30, Full House=25\n\n**Commands:**\n`/yahtzee solo` — play alone\n`/yahtzee pvp @p2` — up to 4 players\n\n**Economy:** Add `bet:` to wager!', de:'**🎲 Yahtzee Anleitung**\n\n5 Würfel, 3 Würfe pro Runde, 13 Kategorien werten. Oberteil ≥ 63 = +35 Bonus!', fr:'**🎲 Guide Yahtzee**\n\n5 dés, 3 lancers, 13 catégories. Bonus +35 si section supérieure ≥ 63!', ru:'**🎲 Руководство Яхтзи**\n\n5 кубиков, 3 броска, 13 категорий. Бонус +35 если верхняя секция ≥ 63!' },
  'guide.uno':         { en:'**🃏 UNO Guide**\n\n**How to play:**\n1. Match the top card by color or number\n2. Use "View my hand" to see your cards privately\n3. Special cards: ⛔Skip, 🔄Reverse, +2, 🌈Wild, +4\n4. Stack +2/+4 on penalty cards or draw\n5. First to play all cards wins!\n\n**Commands:**\n`/uno @p2 @p3 @p4` — 2-4 players\n\n**Economy:** Add `bet:` to wager!', de:'**🃏 UNO Anleitung**\n\nFarbe oder Zahl matchen. Sonderkarten: Skip, Reverse, +2, Wild, +4. Erster ohne Karten gewinnt!', fr:'**🃏 Guide UNO**\n\nAssortissez couleur ou numéro. Cartes spéciales: Skip, Reverse, +2, Wild, +4!', ru:'**🃏 Руководство UNO**\n\nСовпадение по цвету или числу. Специальные карты: Skip, Reverse, +2, Wild, +4!' },
  'guide.mastermind':  { en:'**🔐 Mastermind Guide**\n\n**How to play:**\n1. AI sets a secret 4-color code\n2. You have 10 guesses\n3. After each guess:\n   🔴 = right color in right position\n   ⚪ = right color in wrong position\n4. Crack the code to win!\n\n**Colors:** 🔴🟠🟡🟢🔵🟣\n\n**Commands:**\n`/mastermind solo` — vs AI\n`/mastermind pvp @codebreaker` — PvP\n\n**Economy:** Add `bet:` to wager!', de:'**🔐 Mastermind Anleitung**\n\n4-Farben-Code knacken. 🔴=richtige Farbe+Position, ⚪=richtige Farbe falsche Position. 10 Versuche!', fr:'**🔐 Guide Mastermind**\n\nDevinez le code 4 couleurs. 🔴=bonne couleur+position, ⚪=bonne couleur mauvaise position.', ru:'**🔐 Руководство Мастермайнд**\n\nУгадайте 4-цветный код. 🔴=правильно, ⚪=цвет верный, позиция нет.' },
  'guide.truthordare': { en:'**🎯 Truth or Dare Guide**\n\n**How to play:**\n• Each player\'s turn: choose Truth or Dare\n• Answer honestly or complete the dare!\n• Skip if you really can\'t (no shame)\n• Rotating turns, configurable rounds\n\n**Difficulties:** Easy · Medium · Hard\n\n**Commands:**\n`/truthordare @p2 @p3...` — 2-6 players\nOptions: `difficulty:` `rounds:`', de:'**🎯 Wahrheit oder Pflicht Anleitung**\n\nReihum: Wahrheit ehrlich beantworten oder Pflicht erfüllen!', fr:'**🎯 Guide Action ou Vérité**\n\nTour par tour: répondez honnêtement ou accomplissez le défi!', ru:'**🎯 Правда или действие**\n\nПо очереди: ответьте честно или выполните задание!' },
  'guide.wouldyourather':{ en:'**🤔 Would You Rather Guide**\n\n**How to play:**\n• A question with 2 options appears\n• Everyone votes for their choice\n• See live results and percentages\n• Discuss and debate!\n\n**Categories:** Fun · Deep · Cursed 😈\n\n**Commands:**\n`/wouldyourather` — solo or group\nOptions: `category:` `rounds:`', de:'**🤔 Lieber... oder... Anleitung**\n\nJeder wählt eine Option. Live-Abstimmung mit Prozenten!', fr:'**🤔 Guide Tu Préfères**\n\nChacun vote, résultats en direct!', ru:'**🤔 Что лучше**\n\nКаждый голосует, результаты в реальном времени!' },
  'guide.ghostsagainst':{ en:'**🃏 Ghosts Against Discord Guide**\n\n**How to play:**\n1. Each round: one player is the Judge (Card Czar)\n2. A black card with a prompt appears\n3. All other players submit their funniest white card\n4. Judge picks the winner — they get a point\n5. Judge rotates each round\n\n**Commands:**\n`/ghostsagainst @p2 @p3` — 3-8 players\nOptions: `rounds:`\n\n*18+ content — use responsibly!*', de:'**🃏 Geister gegen Discord Anleitung**\n\nSchwarze Karte vorlesen, lustigste Antwort-Karte wählen. Richter rotiert!', fr:'**🃏 Guide Fantômes**\n\nCarte noire + meilleure réponse gagne le point!', ru:'**🃏 Призраки против Discord**\n\nЧёрная карта + смешной ответ = очко!' },
  'guide.memelord':    { en:'**😂 Memelord Guide**\n\n**How to play:**\n1. A meme template appears (e.g. Drake, Distracted Boyfriend)\n2. Players write their funniest caption\n3. Judge picks the winner\n4. Most wins = MEMELORD 👑\n\n**Commands:**\n`/memelord @p2 @p3` — 2-5 players\nOptions: `rounds:`', de:'**😂 Memelord Anleitung**\n\nMeme-Template → lustigste Bildunterschrift schreiben → Richter wählt!', fr:'**😂 Guide Memelord**\n\nTemplate de mème → écrivez la légende la plus drôle!', ru:'**😂 Руководство Мем-лорд**\n\nШаблон мема → напишите смешную подпись!' },
  'guide.guesssong':   { en:'**🎵 Guess the Song Guide**\n\n**How to play:**\n1. Emoji clues + a lyric snippet appear\n2. Click Guess and type the song title or artist\n3. First to guess correctly wins the round\n4. Use Artist Hint if stuck (shows first name)\n\n**Commands:**\n`/guesssong` — solo or multiplayer\nOptions: `rounds:` `bet:` `player2:` `player3:`', de:'**🎵 Errate den Song Anleitung**\n\nEmoji + Textzeile als Hinweis. Titel oder Künstler erraten!', fr:'**🎵 Guide Devine la Chanson**\n\nEmojis + paroles en indice. Devinez titre ou artiste!', ru:'**🎵 Угадай песню**\n\nЭмодзи + строчка из песни. Угадайте название или исполнителя!' },
  'guide.rps':         { en:'**✊ Rock Paper Scissors Guide**\n\nChoose Rock 🪨, Paper 📄, or Scissors ✂️.\nBest of 3 rounds wins!\n\n**Rules:** Rock beats Scissors · Paper beats Rock · Scissors beats Paper\n\n**Commands:** `/rps` — vs AI', de:'**✊ Stein Papier Schere Anleitung**\n\nBeste 2 von 3 Runden! Stein schlägt Schere, Papier schlägt Stein, Schere schlägt Papier.', fr:'**✊ Guide Pierre Papier Ciseaux**\n\nMeilleur de 3 manches!', ru:'**✊ Камень Ножницы Бумага**\n\nЛучший из 3 раундов!' },
  'guide.hangman':     { en:'**🪢 Hangman Guide**\n\nGuess the hidden word one letter at a time.\nYou have 6 wrong guesses before game over!\n\n**Commands:** `/hangman` — solo game', de:'**🪢 Galgenmännchen Anleitung**\n\nBuchstaben raten. 6 Fehlversuche erlaubt!', fr:'**🪢 Guide Pendu**\n\nDevinez les lettres du mot caché. 6 erreurs maximum!', ru:'**🪢 Виселица**\n\nУгадывайте буквы. 6 ошибок максимум!' },
  'guide.minesweeper': { en:'**💣 Minesweeper Guide**\n\nReveal all safe tiles without hitting a mine!\nNumbers show adjacent mine count.\n\n**Difficulties:** Easy · Medium · Hard\n\n**Commands:** `/minesweeper difficulty:easy`', de:'**💣 Minesweeper Anleitung**\n\nAlle sicheren Felder aufdecken ohne Mine!', fr:'**💣 Guide Démineur**\n\nRévélez toutes les cases sûres sans toucher une mine!', ru:'**💣 Сапёр**\n\nОткройте все безопасные клетки без мин!' },
  'guide.numguess':    { en:'**🔢 Number Guess Guide**\n\nGuess a number between 1-100 within 7 attempts!\nThe bot hints higher/lower after each guess.\n\n**Commands:** `/numguess`', de:'**🔢 Zahlenraten Anleitung**\n\nZahl von 1-100 in 7 Versuchen erraten!', fr:'**🔢 Guide Deviner le Nombre**\n\nDevinez le nombre entre 1-100 en 7 essais!', ru:'**🔢 Угадай число**\n\nУгадайте число от 1 до 100 за 7 попыток!' },
  'guide.quiz':        { en:'**❓ Quiz Guide**\n\nAnswer trivia questions with 4 answer choices.\nFastest correct answer wins each round!\n\n**Commands:** `/quiz`', de:'**❓ Quiz Anleitung**\n\n4 Antwortmöglichkeiten pro Frage. Schnellster gewinnt!', fr:'**❓ Guide Quiz**\n\n4 choix de réponse. Le plus rapide gagne!', ru:'**❓ Викторина**\n\n4 варианта ответа. Самый быстрый побеждает!' },
  'guide.dice':        { en:'**🎲 Dice Guide**\n\nRoll any dice combination using standard notation!\n\n**Examples:**\n`/dice notation:2d6` — two 6-sided dice\n`/dice notation:1d20` — one 20-sided die\n`/dice notation:4d4+2` — four 4-sided dice + 2', de:'**🎲 Würfel Anleitung**\n\n`2d6` = zwei 6er-Würfel, `1d20` = ein 20er-Würfel!', fr:'**🎲 Guide Dés**\n\n`2d6` = deux dés à 6 faces, `1d20` = un dé à 20 faces!', ru:'**🎲 Кубики**\n\n`2d6` = два шестигранника, `1d20` = один двадцатигранник!' },



  // ── Autosave command ────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════
  // GAMBLE-CONFIG COMMAND
  // ═══════════════════════════════════════════════════════════════════
  'economy.admin.maxbet_title': {
    en: '🪙 Max Bet Updated',
    de: '🪙 Max-Einsatz aktualisiert',
    fr: '🪙 Mise maximale mise à jour',
    ru: '🪙 Максимальная ставка обновлена',
  },
  'economy.admin.maxbet_prev': {
    en: 'Previous limit',
    de: 'Vorheriges Limit',
    fr: 'Ancienne limite',
    ru: 'Предыдущий лимит',
  },
  'economy.admin.maxbet_new': {
    en: 'New limit',
    de: 'Neues Limit',
    fr: 'Nouvelle limite',
    ru: 'Новый лимит',
  },
  'economy.admin.maxbet_none': {
    en: '∞ No limit',
    de: '∞ Kein Limit',
    fr: '∞ Aucune limite',
    ru: '∞ Без лимита',
  },
  'economy.admin.maxbet_prev_none': {
    en: '∞ No limit',
    de: '∞ Kein Limit',
    fr: '∞ Aucune limite',
    ru: '∞ Без лимита',
  },
  'economy.admin.maxbet_set': {
    en: '✅ Players can now bet at most **🪙 {amount}** per game.',
    de: '✅ Spieler können jetzt maximal **🪙 {amount}** pro Spiel setzen.',
    fr: '✅ Les joueurs peuvent maintenant miser au maximum **🪙 {amount}** par partie.',
    ru: '✅ Игроки теперь могут ставить не более **🪙 {amount}** за игру.',
  },
  'economy.admin.maxbet_removed': {
    en: '✅ Max bet limit removed — players can bet any amount.',
    de: '✅ Max-Einsatz-Limit entfernt — Spieler können beliebig viel setzen.',
    fr: '✅ Limite de mise maximale supprimée — les joueurs peuvent miser n\'importe quel montant.',
    ru: '✅ Лимит максимальной ставки снят — игроки могут ставить любую сумму.',
  },
  'economy.admin.maxbet_clamped': {
    en: 'Your bet was reduced to **🪙 {amount}** (server limit). Start the game again with an allowed amount.',
    de: 'Dein Einsatz wurde auf **🪙 {amount}** reduziert (Server-Limit). Starte das Spiel erneut mit einem erlaubten Betrag.',
    fr: 'Votre mise a été réduite à **🪙 {amount}** (limite du serveur). Relancez le jeu avec un montant autorisé.',
    ru: 'Ваша ставка была уменьшена до **🪙 {amount}** (лимит сервера). Начните игру снова с допустимой суммой.',
  },

  // ═══════════════════════════════════════════════════════════════════
  // AUTO-DEFEND COMMAND
  // ═══════════════════════════════════════════════════════════════════
  'autodefend.title': {
    en: '🛡️ Auto-Defend',
    de: '🛡️ Auto-Verteidigung',
    fr: '🛡️ Défense automatique',
    ru: '🛡️ Авто-защита',
  },
  'autodefend.enabled': {
    en: '✅ Auto-Defend **activated** — the bot now automatically intervenes against attacks.',
    de: '✅ Auto-Verteidigung **aktiviert** — der Bot greift jetzt automatisch gegen Angriffe ein.',
    fr: '✅ Défense automatique **activée** — le bot intervient maintenant automatiquement contre les attaques.',
    ru: '✅ Авто-защита **активирована** — бот теперь автоматически реагирует на атаки.',
  },
  'autodefend.disabled': {
    en: '❌ Auto-Defend **deactivated** — severity-based actions apply again.',
    de: '❌ Auto-Verteidigung **deaktiviert** — Schweregrad-basierte Aktionen gelten wieder.',
    fr: '❌ Défense automatique **désactivée** — les actions basées sur la sévérité s\'appliquent à nouveau.',
    ru: '❌ Авто-защита **отключена** — снова применяются действия на основе уровня серьёзности.',
  },
  'autodefend.action_set': {
    en: '✅ Action for **{attack}** set to `{action}`.',
    de: '✅ Aktion für **{attack}** auf `{action}` gesetzt.',
    fr: '✅ Action pour **{attack}** définie sur `{action}`.',
    ru: '✅ Действие для **{attack}** установлено на `{action}`.',
  },
  'autodefend.status_title': {
    en: '🛡️ Auto-Defend Status',
    de: '🛡️ Auto-Verteidigungs-Status',
    fr: '🛡️ Statut de la défense automatique',
    ru: '🛡️ Статус авто-защиты',
  },
  'autodefend.status_mode': {
    en: '⚙️ Mode',
    de: '⚙️ Modus',
    fr: '⚙️ Mode',
    ru: '⚙️ Режим',
  },
  'autodefend.mode_on': {
    en: '✅ Active',
    de: '✅ Aktiv',
    fr: '✅ Actif',
    ru: '✅ Активен',
  },
  'autodefend.mode_off': {
    en: '❌ Inactive (severity-based)',
    de: '❌ Inaktiv (Schweregrad-basiert)',
    fr: '❌ Inactif (basé sur la sévérité)',
    ru: '❌ Неактивен (на основе серьёзности)',
  },
  'autodefend.field_raid': {
    en: '🚨 Raid',
    de: '🚨 Raid',
    fr: '🚨 Raid',
    ru: '🚨 Рейд',
  },
  'autodefend.field_spam': {
    en: '💬 Spam',
    de: '💬 Spam',
    fr: '💬 Spam',
    ru: '💬 Спам',
  },
  'autodefend.field_phishing': {
    en: '🎣 Phishing',
    de: '🎣 Phishing',
    fr: '🎣 Phishing',
    ru: '🎣 Фишинг',
  },
  'autodefend.field_ping': {
    en: '📢 Mass-Ping',
    de: '📢 Massen-Ping',
    fr: '📢 Mass-Ping',
    ru: '📢 Масс-пинг',
  },
  'autodefend.field_link': {
    en: '🔗 Invite Links',
    de: '🔗 Einladungslinks',
    fr: '🔗 Liens d\'invitation',
    ru: '🔗 Инвайт-ссылки',
  },
  'autodefend.action_ban': {
    en: '🔨 Ban',
    de: '🔨 Bannen',
    fr: '🔨 Bannir',
    ru: '🔨 Бан',
  },
  'autodefend.action_kick': {
    en: '👢 Kick',
    de: '👢 Kicken',
    fr: '👢 Expulser',
    ru: '👢 Кик',
  },
  'autodefend.action_timeout': {
    en: '⏱️ Timeout (10 min)',
    de: '⏱️ Timeout (10 Min.)',
    fr: '⏱️ Expulsion temporaire (10 min)',
    ru: '⏱️ Таймаут (10 мин)',
  },
  'autodefend.action_lockdown': {
    en: '🔒 Lockdown + Kick',
    de: '🔒 Lockdown + Kick',
    fr: '🔒 Verrouillage + Expulsion',
    ru: '🔒 Блокировка + Кик',
  },
  'autodefend.action_warn': {
    en: '⚠️ Warn (DM)',
    de: '⚠️ Verwarnen (DM)',
    fr: '⚠️ Avertissement (DM)',
    ru: '⚠️ Предупреждение (ЛС)',
  },
  'autodefend.hint': {
    en: 'These actions override the severity setting when auto-defend is active.',
    de: 'Diese Aktionen überschreiben die Schweregrad-Einstellung wenn Auto-Verteidigung aktiv ist.',
    fr: 'Ces actions remplacent le paramètre de sévérité quand la défense automatique est active.',
    ru: 'Эти действия отменяют настройку серьёзности, когда авто-защита активна.',
  },

  'gamblecfg.title': {
    en: '🎰 Gambling Configuration',
    de: '🎰 Gambling-Konfiguration',
    fr: '🎰 Configuration des jeux',
    ru: '🎰 Настройки азартных игр',
  },
  'gamblecfg.cooldown_set': {
    en: '⏱️ Cooldown updated',
    de: '⏱️ Cooldown aktualisiert',
    fr: '⏱️ Cooldown mis à jour',
    ru: '⏱️ Кулдаун обновлён',
  },
  'gamblecfg.cooldown_desc': {
    en: 'The cooldown between gambling commands is now **{seconds}s** ({ms} ms).',
    de: 'Der Cooldown zwischen Gambling-Befehlen beträgt jetzt **{seconds}s** ({ms} ms).',
    fr: 'Le délai entre les commandes de jeu est maintenant **{seconds}s** ({ms} ms).',
    ru: 'Кулдаун между командами азартных игр теперь **{seconds}s** ({ms} мс).',
  },
  'gamblecfg.cooldown_zero': {
    en: '⚠️ Cooldown set to **0s** — no cooldown between games.',
    de: '⚠️ Cooldown auf **0s** gesetzt — kein Cooldown zwischen Spielen.',
    fr: '⚠️ Cooldown défini à **0s** — aucun délai entre les parties.',
    ru: '⚠️ Кулдаун установлен в **0s** — без ожидания между играми.',
  },
  'gamblecfg.disclaimer_on': {
    en: '✅ Gambling disclaimer **enabled** — players must confirm before playing.',
    de: '✅ Gambling-Hinweis **aktiviert** — Spieler müssen vor dem Spielen bestätigen.',
    fr: '✅ Avertissement de jeu **activé** — les joueurs doivent confirmer avant de jouer.',
    ru: '✅ Предупреждение об азартных играх **включено** — игроки должны подтверждать перед игрой.',
  },
  'gamblecfg.disclaimer_off': {
    en: '❌ Gambling disclaimer **disabled** — games start immediately.',
    de: '❌ Gambling-Hinweis **deaktiviert** — Spiele starten sofort.',
    fr: '❌ Avertissement de jeu **désactivé** — les parties démarrent immédiatement.',
    ru: '❌ Предупреждение об азартных играх **отключено** — игры начинаются немедленно.',
  },
  'gamblecfg.status_title': {
    en: '🎰 Gambling Settings',
    de: '🎰 Gambling-Einstellungen',
    fr: '🎰 Paramètres des jeux',
    ru: '🎰 Настройки азартных игр',
  },
  'gamblecfg.status_cooldown': {
    en: '⏱️ Cooldown',
    de: '⏱️ Cooldown',
    fr: '⏱️ Cooldown',
    ru: '⏱️ Кулдаун',
  },
  'gamblecfg.status_cooldown_val': {
    en: '**{seconds}s** between games',
    de: '**{seconds}s** zwischen Spielen',
    fr: '**{seconds}s** entre les parties',
    ru: '**{seconds}s** между играми',
  },
  'gamblecfg.status_cooldown_off': {
    en: '**Off** (no cooldown)',
    de: '**Aus** (kein Cooldown)',
    fr: '**Désactivé** (aucun délai)',
    ru: '**Выкл** (без кулдауна)',
  },
  'gamblecfg.status_disclaimer': {
    en: '📋 Disclaimer',
    de: '📋 Hinweis',
    fr: '📋 Avertissement',
    ru: '📋 Предупреждение',
  },
  'gamblecfg.status_disclaimer_on': {
    en: '✅ Enabled (players must confirm)',
    de: '✅ Aktiviert (Spieler müssen bestätigen)',
    fr: '✅ Activé (les joueurs doivent confirmer)',
    ru: '✅ Включено (игроки должны подтверждать)',
  },
  'gamblecfg.status_disclaimer_off': {
    en: '❌ Disabled (instant start)',
    de: '❌ Deaktiviert (sofortiger Start)',
    fr: '❌ Désactivé (démarrage immédiat)',
    ru: '❌ Отключено (мгновенный старт)',
  },
  'gamblecfg.invalid_seconds': {
    en: '❌ Value must be between 0 and 300 seconds.',
    de: '❌ Der Wert muss zwischen 0 und 300 Sekunden liegen.',
    fr: '❌ La valeur doit être comprise entre 0 et 300 secondes.',
    ru: '❌ Значение должно быть от 0 до 300 секунд.',
  },

  'autosave.saved':    { en:'✅ Saved to GitHub',        de:'✅ Auf GitHub gespeichert',   fr:'✅ Sauvegardé sur GitHub',      ru:'✅ Сохранено на GitHub' },
  'autosave.restored': { en:'✅ Database Restored',      de:'✅ Datenbank wiederhergestellt',fr:'✅ Base de données restaurée',  ru:'✅ База данных восстановлена' },
  'autosave.failed':   { en:'❌ Save Failed',            de:'❌ Speichern fehlgeschlagen',  fr:'❌ Échec de la sauvegarde',     ru:'❌ Ошибка сохранения' },
  'autosave.notfound': { en:'⚠️ No backup found',       de:'⚠️ Kein Backup gefunden',     fr:'⚠️ Aucune sauvegarde trouvée',  ru:'⚠️ Резервная копия не найдена' },
  'autosave.restart':  { en:'Bot must be restarted for changes to take effect.', de:'Bot muss neugestartet werden damit die Änderungen greifen.', fr:'Le bot doit être redémarré pour appliquer les changements.', ru:'Бот должен быть перезапущен для применения изменений.' },

  // ── About command ──────────────────────────────────────────────────────────
  'about.title':       { en:'About MultiBotV2',           de:'Über MultiBotV2',              fr:'À propos de MultiBotV2',         ru:'О MultiBotV2' },
  'about.desc':        { en:'The ultimate all-in-one Discord bot — free forever.',  de:'Der ultimative All-in-One Discord Bot — kostenlos für immer.', fr:'Le bot Discord tout-en-un ultime — gratuit pour toujours.', ru:'Универсальный Discord бот — бесплатно навсегда.' },
  'about.version':     { en:'Version',                    de:'Version',                      fr:'Version',                         ru:'Версия' },
  'about.commands':    { en:'Commands',                   de:'Befehle',                      fr:'Commandes',                       ru:'Команды' },
  'about.servers':     { en:'Servers',                    de:'Server',                       fr:'Serveurs',                        ru:'Серверов' },
  'about.users':       { en:'Users',                      de:'Nutzer',                       fr:'Utilisateurs',                    ru:'Пользователей' },
  'about.uptime':      { en:'Uptime',                     de:'Laufzeit',                     fr:'Disponibilité',                   ru:'Аптайм' },
  'about.ping':        { en:'Ping',                       de:'Ping',                         fr:'Ping',                            ru:'Пинг' },
  'about.tech':        { en:'Built with',                 de:'Erstellt mit',                 fr:'Construit avec',                  ru:'Создан с' },
  'about.invite':      { en:'Invite the Bot',             de:'Bot einladen',                 fr:'Inviter le Bot',                  ru:'Пригласить бота' },
  'about.features':    { en:'Features',                   de:'Features',                     fr:'Fonctionnalités',                 ru:'Функции' },
  'about.free':        { en:'100% Free • No premium • No paywalls', de:'100% Kostenlos • Kein Premium • Keine Paywalls', fr:'100% Gratuit • Sans premium • Sans paywall', ru:'100% Бесплатно • Без премиума • Без платных барьеров' },
  'about.language_en_only': { en: 'English', de: 'Englisch', fr: 'Anglais', ru: 'Английский' },

  // ── Massrole command ────────────────────────────────────────────────────────
  'massrole.title':    { en:'Mass Role',                  de:'Massen-Rolle',                 fr:'Rôle de masse',                   ru:'Массовая роль' },
  'massrole.adding':   { en:'Adding role to all members...', de:'Rolle wird allen Mitgliedern hinzugefügt...', fr:'Ajout du rôle à tous les membres...', ru:'Добавление роли всем участникам...' },
  'massrole.removing': { en:'Removing role from all members...', de:'Rolle wird von allen Mitgliedern entfernt...', fr:'Suppression du rôle de tous les membres...', ru:'Удаление роли у всех участников...' },
  'massrole.done':     { en:'Done! {success} members updated, {failed} failed.', de:'Fertig! {success} Mitglieder aktualisiert, {failed} fehlgeschlagen.', fr:'Terminé! {success} membres mis à jour, {failed} échecs.', ru:'Готово! {success} участников обновлено, {failed} ошибок.' },
  'massrole.noPerms':  { en:'I cannot assign this role — check my role hierarchy.', de:'Ich kann diese Rolle nicht vergeben — prüfe meine Rollenhierarchie.', fr:'Je ne peux pas attribuer ce rôle — vérifiez ma hiérarchie de rôles.', ru:'Не могу назначить эту роль — проверьте иерархию ролей.' },
  'massrole.progress': { en:'Processing: {done}/{total} members...', de:'Verarbeitung: {done}/{total} Mitglieder...', fr:'Traitement: {done}/{total} membres...', ru:'Обработка: {done}/{total} участников...' },
  'massrole.cantAssign':{ en:'Cannot assign managed/bot roles.', de:'Verwaltete/Bot-Rollen können nicht vergeben werden.', fr:'Impossible d\'attribuer des rôles gérés/bot.', ru:'Нельзя назначать управляемые/бот роли.' },

  // ═══════════════════════════════════════════════════════════════════
  // APPLICATIONS
  // ═══════════════════════════════════════════════════════════════════
  'app.apply': {
    en: 'Apply Now',
    de: 'Jetzt bewerben',
    fr: 'Postuler maintenant',
    ru: 'Подать заявку',
  },
  'app.submitted': {
    en: '✅ Application submitted',
    de: '✅ Bewerbung eingereicht',
    fr: '✅ Demande soumise',
    ru: '✅ Заявка подана',
  },
  'app.approved': {
    en: '✅ {user} application approved',
    de: '✅ {user} Bewerbung genehmigt',
    fr: '✅ demande de {user} approuvée',
    ru: '✅ Заявка {user} одобрена',
  },
  'app.rejected': {
    en: '❌ {user} application rejected',
    de: '❌ {user} Bewerbung abgelehnt',
    fr: '❌ demande de {user} rejetée',
    ru: '❌ Заявка {user} отклонена',
  },

  // ═══════════════════════════════════════════════════════════════════
  // STATS & TRACKING
  // ═══════════════════════════════════════════════════════════════════
  'stats.title': {
    en: 'Server Statistics',
    de: 'Server-Statistiken',
    fr: 'Statistiques du serveur',
    ru: 'Статистика сервера',
  },
  'stats.members': {
    en: 'Members',
    de: 'Mitglieder',
    fr: 'Membres',
    ru: 'Члены',
  },
  'stats.bots': {
    en: 'Bots',
    de: 'Bots',
    fr: 'Bots',
    ru: 'Боты',
  },
  'stats.boosters': {
    en: 'Boosters',
    de: 'Booster',
    fr: 'Boosteurs',
    ru: 'Бустеры',
  },
  'level.levelup': {
    en: '🎉 {user} reached **Level {level}**! ({xp} XP | next level: {needed} XP)',
    de: '🎉 {user} hat **Level {level}** erreicht! ({xp} XP | nächstes Level: {needed} XP)',
    fr: '🎉 {user} a atteint le **Niveau {level}** ! ({xp} XP | niveau suivant: {needed} XP)',
    ru: '🎉 {user} достиг **Уровня {level}**! ({xp} XP | следующий уровень: {needed} XP)',
  },
  'automod.watch_language': {
    en: 'Please watch your language!',
    de: 'Bitte achte auf deine Ausdrucksweise!',
    fr: 'Veuillez surveiller votre langage!',
    ru: 'Пожалуйста, следите за своим языком!',
  },
  // ═══════════════════════════════════════════════════════════════════
  // TICKETS – SYSTEM TEXT (Bot-generated, not user-configured)
  // ═══════════════════════════════════════════════════════════════════
  'ticket.btn_close': { en: '🔒 Close', de: '🔒 Schließen', fr: '🔒 Fermer', ru: '🔒 Закрыть' },
  'ticket.btn_claim': { en: '✋ Claim', de: '✋ Übernehmen', fr: '✋ Prendre en charge', ru: '✋ Взять' },
  'ticket.btn_transcript': { en: '📄 Transcript', de: '📄 Protokoll', fr: '📄 Transcript', ru: '📄 Протокол' },
  'ticket.default_desc': { en: 'Click the button to open a ticket.', de: 'Klicke den Button um ein Ticket zu öffnen.', fr: 'Cliquez sur le bouton pour ouvrir un ticket.', ru: 'Нажмите кнопку, чтобы открыть тикет.' },
  'ticket.support_arrives': { en: 'Support will be with you shortly.', de: 'Support meldet sich gleich bei dir.', fr: 'Le support sera avec vous très bientôt.', ru: 'Поддержка скоро ответит вам.' },
  'ticket.created_in': { en: 'Your ticket has been created', de: 'Dein Ticket wurde erstellt', fr: 'Votre ticket a été créé', ru: 'Ваш тикет создан' },
  'ticket.created_desc': { en: 'Your ticket has been created: {channel}', de: 'Dein Ticket wurde erstellt: {channel}', fr: 'Votre ticket a été créé: {channel}', ru: 'Ваш тикет создан: {channel}' },

  // ═══════════════════════════════════════════════════════════════════
  // VERIFICATION – SYSTEM TEXT
  // ═══════════════════════════════════════════════════════════════════
  'verify.captcha_title': { en: '🔐 Verification Required', de: '🔐 Verifizierung erforderlich', fr: '🔐 Vérification requise', ru: '🔐 Требуется верификация' },
  'verify.modal_title': { en: 'Verification', de: 'Verifizierung', fr: 'Vérification', ru: 'Верификация' },
  'verify.modal_label': { en: 'Enter the code from the image', de: 'Gib den Code aus dem Bild ein', fr: 'Entrez le code de l\'image', ru: 'Введите код с изображения' },
  'verify.expired': { en: 'Captcha expired', de: 'Captcha abgelaufen', fr: 'Captcha expiré', ru: 'Капча истекла' },
  'verify.expired_desc': { en: 'Please click "Verify" again to get a new code.', de: 'Klicke erneut auf "Verifizieren" für einen neuen Code.', fr: 'Cliquez à nouveau sur "Vérifier" pour obtenir un nouveau code.', ru: 'Нажмите "Верификация" снова, чтобы получить новый код.' },
  'verify.complete': { en: '✅ Verification Complete', de: '✅ Verifizierung abgeschlossen', fr: '✅ Vérification complète', ru: '✅ Верификация завершена' },

  // ═══════════════════════════════════════════════════════════════════
  // GIVEAWAY – SYSTEM TEXT
  // ═══════════════════════════════════════════════════════════════════
  'giveaway.btn_enter': { en: '🎉 Enter', de: '🎉 Teilnehmen', fr: '🎉 Participer', ru: '🎉 Участвовать' },
  'giveaway.btn_entered': { en: '✅ Entered', de: '✅ Angemeldet', fr: '✅ Inscrit', ru: '✅ Участвую' },
  'giveaway.ends_at': { en: 'Ends', de: 'Endet', fr: 'Se termine', ru: 'Завершается' },
  'giveaway.hosted_by': { en: 'Hosted by', de: 'Veranstaltet von', fr: 'Organisé par', ru: 'Организатор' },
  'giveaway.participants': { en: 'Participants', de: 'Teilnehmer', fr: 'Participants', ru: 'Участники' },
  'giveaway.ended_title': { en: '🎊 Giveaway Ended!', de: '🎊 Gewinnspiel beendet!', fr: '🎊 Concours terminé!', ru: '🎊 Розыгрыш завершён!' },
  'giveaway.winner': { en: '🏆 Winner', de: '🏆 Gewinner', fr: '🏆 Gagnant', ru: '🏆 Победитель' },
  'giveaway.no_winner': { en: 'No valid participants.', de: 'Keine gültigen Teilnehmer.', fr: 'Aucun participant valide.', ru: 'Нет действительных участников.' },

  // ═══════════════════════════════════════════════════════════════════
  // LEVEL SYSTEM – SYSTEM TEXT
  // ═══════════════════════════════════════════════════════════════════
  'level.up_title': { en: '🎉 Level Up!', de: '🎉 Level Up!', fr: '🎉 Niveau supérieur!', ru: '🎉 Новый уровень!' },
  'level.up_desc': { en: '{user} reached **Level {level}**!', de: '{user} hat **Level {level}** erreicht!', fr: '{user} a atteint le **Niveau {level}**!', ru: '{user} достиг **уровня {level}**!' },
  'level.role_reward': { en: 'You received the role {role}!', de: 'Du hast die Rolle {role} erhalten!', fr: 'Vous avez reçu le rôle {role}!', ru: 'Вы получили роль {role}!' },

  // ═══════════════════════════════════════════════════════════════════
  // WELCOME SYSTEM – SYSTEM TEXT
  // ═══════════════════════════════════════════════════════════════════
  'welcome.default_title': { en: 'Welcome to {server}!', de: 'Willkommen auf {server}!', fr: 'Bienvenue sur {server}!', ru: 'Добро пожаловать на {server}!' },
  'welcome.default_desc': { en: 'Hey {user}, welcome to the server! You are member #{count}.', de: 'Hey {user}, willkommen auf dem Server! Du bist Mitglied #{count}.', fr: 'Salut {user}, bienvenue sur le serveur! Tu es le membre #{count}.', ru: 'Привет {user}, добро пожаловать! Ты участник #{count}.' },
};


/**
 * Get a localized string for a given language
 * Supports variable placeholders like {variable}
 */
export function getLocalized(key: string, language: Language, variables?: Record<string, string>): string {
  const localizedStrings = strings[key];
  if (!localizedStrings) {
    console.warn(`[Localization] Missing key: ${key}`);
    return key;
  }

  let result = localizedStrings[language] || localizedStrings['en'];

  // Replace variables in the string
  if (variables) {
    Object.entries(variables).forEach(([varKey, value]) => {
      result = result.replace(new RegExp(`{${varKey}}`, 'g'), value);
    });
  }

  return result;
}

/**
 * Get the language name in that language
 */
export function getLanguageName(lang: Language): string {
  const names: Record<Language, string> = {
    en: 'English',
    de: 'Deutsch',
    fr: 'Français',
    ru: 'Русский',
  };
  return names[lang];
}

/**
 * Check if a language string is valid
 */
export function isValidLanguage(lang: string): lang is Language {
  return ['en', 'de', 'fr', 'ru'].includes(lang);
}

/**
 * Get all supported languages
 */
export function getSupportedLanguages(): Language[] {
  return ['en', 'de', 'fr', 'ru'];
}

