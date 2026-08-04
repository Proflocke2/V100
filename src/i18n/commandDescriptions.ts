/**
 * commandDescriptions.ts
 *
 * Central registry of Discord slash-command description localizations.
 *
 * Discord renders these based on the USER'S client language — completely
 * independent of the server's /language setting. No runtime code needed;
 * they are uploaded at deploy time via setDescriptionLocalizations().
 *
 * Supported locales here: de (German), fr (French), ru (Russian).
 * English stays in the builder's setDescription() call as the default.
 *
 * Keys must match the command name exactly (as passed to setName()).
 * Max description length per locale: 100 characters.
 */

import { Locale } from 'discord.js';

export type CmdDescMap = Partial<Record<Locale, string>>;
export type CmdTranslations = Record<string, CmdDescMap>;

/**
 * Optional name localizations (only needed when the command name itself
 * should differ by language — rare for English-named bots, left empty by
 * default but the infrastructure is here if you ever need it).
 */
export const COMMAND_NAME_LOCALIZATIONS: Record<string, CmdDescMap> = {};

/**
 * Description localizations for every slash command.
 * English fallback lives in each command's .setDescription() call.
 */
export const COMMAND_DESC_LOCALIZATIONS: CmdTranslations = {

  // ── Utility ─────────────────────────────────────────────────────────
  deploy: {
    [Locale.German]: 'Alle Slash-Commands neu registrieren [Bot-Owner / Admin]',
    [Locale.French]: 'Ré-enregistrer toutes les commandes slash [Propriétaire / Admin]',
    [Locale.Russian]: 'Перерегистрировать все слэш-команды [Владелец / Админ]',
  },
  data: {
    [Locale.German]: 'Eigene gespeicherte Daten anzeigen oder löschen (DSGVO Art. 17)',
    [Locale.French]: 'Voir ou supprimer vos données personnelles (RGPD Art. 17)',
    [Locale.Russian]: 'Просмотреть или удалить свои данные (GDPR ст. 17)',
  },
  about: {
    [Locale.German]: 'Über MultiBotV2 — Features, Statistiken & Einlade-Link',
    [Locale.French]: 'À propos de MultiBotV2 — fonctionnalités, stats & lien d\'invitation',
    [Locale.Russian]: 'О MultiBotV2 — функции, статистика и ссылка для приглашения',
  },
  announce: {
    [Locale.German]: 'Ankündigung in einem Kanal senden',
    [Locale.French]: 'Envoyer une annonce dans un salon',
    [Locale.Russian]: 'Отправить объявление в канал',
  },
  avatar: {
    [Locale.German]: 'Avatar eines Benutzers anzeigen',
    [Locale.French]: 'Afficher l\'avatar d\'un utilisateur',
    [Locale.Russian]: 'Показать аватар пользователя',
  },
  backup: {
    [Locale.German]: 'Datenbank-Backup manuell erstellen oder wiederherstellen',
    [Locale.French]: 'Créer ou restaurer une sauvegarde de la base de données',
    [Locale.Russian]: 'Создать или восстановить резервную копию базы данных',
  },
  'bot-customize': {
    [Locale.German]: "Bot-Identität anpassen: Nickname, Avatar, Banner",
    [Locale.French]: "Personnaliser l'identité du bot : pseudo, avatar, bannière",
    [Locale.Russian]: 'Настроить облик бота: никнейм, аватар, баннер',
  },
  'team-activity': {
    [Locale.German]: 'Team-Aktivität: Sponsoren, Bestenliste, Einstellungen',
    [Locale.French]: "Activité de l'équipe : sponsors, classement, paramètres",
    [Locale.Russian]: 'Активность команды: спонсоры, таблица лидеров, настройки',
  },
  help: {
    [Locale.German]: 'Einfache Text-Anleitung für alle Bot-Befehle erhalten',
    [Locale.French]: 'Obtenir un guide simple expliquant toutes les commandes',
    [Locale.Russian]: 'Получить простое текстовое руководство по всем командам',
  },
  'report-staff': {
    [Locale.German]: 'Ein Teammitglied privat beim High-Staff-Team melden',
    [Locale.French]: 'Signaler un membre du staff en privé à la haute direction',
    [Locale.Russian]: 'Пожаловаться на сотрудника команды в частном порядке',
  },
  sticky: {
    [Locale.German]: 'Eine Nachricht festlegen, die unten im Kanal angeheftet bleibt',
    [Locale.French]: 'Définir un message qui reste épinglé en bas du salon',
    [Locale.Russian]: 'Установить сообщение, закреплённое внизу канала',
  },
  botinfo: {
    [Locale.German]: 'Bot-Statistiken und Informationen anzeigen',
    [Locale.French]: 'Afficher les statistiques et informations du bot',
    [Locale.Russian]: 'Показать статистику и информацию о боте',
  },
  embed: {
    [Locale.German]: 'Benutzerdefiniertes Embed mit vollständiger Formatierung erstellen',
    [Locale.French]: 'Créer et envoyer un embed personnalisé avec mise en forme complète',
    [Locale.Russian]: 'Создать и отправить пользовательский embed с полным форматированием',
  },
  giveaway: {
    [Locale.German]: 'Gewinnspiele verwalten',
    [Locale.French]: 'Gérer les concours',
    [Locale.Russian]: 'Управление розыгрышами',
  },
  language: {
    [Locale.German]: 'Bot-Sprache für diesen Server einstellen oder anzeigen',
    [Locale.French]: 'Définir ou afficher la langue du bot pour ce serveur',
    [Locale.Russian]: 'Установить или просмотреть язык бота для этого сервера',
  },
  level: {
    [Locale.German]: 'Level-System — XP-Rangliste & Profil anzeigen',
    [Locale.French]: 'Système de niveaux — voir classement XP & profil',
    [Locale.Russian]: 'Система уровней — просмотр рейтинга XP и профиля',
  },
  ping: {
    [Locale.German]: 'Bot-Latenz und WebSocket-Ping prüfen',
    [Locale.French]: 'Vérifier la latence du bot et le ping WebSocket',
    [Locale.Russian]: 'Проверить задержку бота и WebSocket-пинг',
  },
  poll: {
    [Locale.German]: 'Umfrage mit optionalem Ablaufdatum erstellen',
    [Locale.French]: 'Créer un sondage avec deadline optionnelle',
    [Locale.Russian]: 'Создать опрос с необязательным сроком',
  },
  quoteboard: {
    [Locale.German]: 'Zitat-Board verwalten',
    [Locale.French]: 'Gérer le tableau de citations',
    [Locale.Russian]: 'Управление доской цитат',
  },
  remind: {
    [Locale.German]: 'Erinnerung mit optionaler Wiederholung setzen',
    [Locale.French]: 'Définir un rappel avec répétition optionnelle',
    [Locale.Russian]: 'Установить напоминание с опциональным повтором',
  },
  roleinfo: {
    [Locale.German]: 'Informationen über eine Rolle anzeigen',
    [Locale.French]: 'Afficher les informations sur un rôle',
    [Locale.Russian]: 'Показать информацию о роли',
  },
  serverinfo: {
    [Locale.German]: 'Server-Informationen anzeigen',
    [Locale.French]: 'Afficher les informations du serveur',
    [Locale.Russian]: 'Показать информацию о сервере',
  },
  setup: {
    [Locale.German]: 'Interaktiver Einrichtungsassistent für Sicherheit & Moderation',
    [Locale.French]: 'Assistant interactif pour la sécurité & la modération',
    [Locale.Russian]: 'Интерактивный мастер настройки безопасности и модерации',
  },
  stats: {
    [Locale.German]: 'Echtzeit-Serverstatistiken als Sprachkanäle konfigurieren',
    [Locale.French]: 'Configurer les statistiques en temps réel comme salons vocaux',
    [Locale.Russian]: 'Настроить статистику сервера в реальном времени как голосовые каналы',
  },
  userinfo: {
    [Locale.German]: 'Benutzer-Informationen anzeigen',
    [Locale.French]: 'Afficher les informations sur un utilisateur',
    [Locale.Russian]: 'Показать информацию о пользователе',
  },
  'v-setup': {
    [Locale.German]: 'Verifizierungssystem konfigurieren',
    [Locale.French]: 'Configurer le système de vérification',
    [Locale.Russian]: 'Настроить систему верификации',
  },
  webhook: {
    [Locale.German]: 'Discord-Webhook-Nachrichten senden und verwalten',
    [Locale.French]: 'Envoyer et gérer des messages webhook Discord',
    [Locale.Russian]: 'Отправка и управление сообщениями Discord webhook',
  },

  // ── Economy ──────────────────────────────────────────────────────────
  blackjack: {
    [Locale.German]: 'Blackjack gegen den Dealer spielen!',
    [Locale.French]: 'Jouer au Blackjack contre le croupier!',
    [Locale.Russian]: 'Играть в Блэкджек против дилера!',
  },
  daily: {
    [Locale.German]: 'Tägliche Münzen beanspruchen — Streak gibt Bonus!',
    [Locale.French]: 'Réclamer vos pièces journalières — le streak donne un bonus!',
    [Locale.Russian]: 'Получить ежедневные монеты — серия даёт бонус!',
  },
  'eco-admin': {
    [Locale.German]: 'Economy-Admin-Befehle [Nur für Admins]',
    [Locale.French]: 'Commandes admin économie [Admin uniquement]',
    [Locale.Russian]: 'Команды администратора экономики [Только для админов]',
  },
  'eco-challenge': {
    [Locale.German]: 'Einen anderen Benutzer zu einem Münzduell herausfordern!',
    [Locale.French]: 'Défier un autre utilisateur dans un duel de pièces!',
    [Locale.Russian]: 'Бросить вызов другому пользователю на монетный дуэль!',
  },
  'eco-stats': {
    [Locale.German]: 'Economy-Statistiken: Kontostand, Bestenliste',
    [Locale.French]: 'Statistiques économie : solde, classement',
    [Locale.Russian]: 'Статистика экономики: баланс, таблица лидеров',
  },
  'eco-config': {
    [Locale.German]: 'Economy-Einstellungen: Gambling-Cooldown/Disclaimer, Lotterie',
    [Locale.French]: 'Paramètres économie : cooldown/avertissement de jeu, loterie',
    [Locale.Russian]: 'Настройки экономики: кулдаун азартных игр, лотерея',
  },
  pay: {
    [Locale.German]: 'Münzen an einen anderen Benutzer überweisen',
    [Locale.French]: 'Transférer des pièces à un autre utilisateur',
    [Locale.Russian]: 'Перевести монеты другому пользователю',
  },
  shop: {
    [Locale.German]: 'Server-Artikel-Shop',
    [Locale.French]: 'Boutique d\'articles du serveur',
    [Locale.Russian]: 'Магазин предметов сервера',
  },
  slots: {
    [Locale.German]: 'Spielautomaten spielen (3×3 Raster, 5 Gewinnlinien)!',
    [Locale.French]: 'Jouer aux machines à sous (grille 3×3, 5 lignes gagnantes)!',
    [Locale.Russian]: 'Играть на слот-машине (сетка 3×3, 5 выигрышных линий)!',
  },

  // ── Games ────────────────────────────────────────────────────────────
  battleship: {
    [Locale.German]: 'Schiffe versenken — Schiffe platzieren & die feindliche Flotte versenken! 🎯',
    [Locale.French]: 'Bataille Navale — placez vos navires & coulez la flotte ennemie! 🎯',
    [Locale.Russian]: 'Морской бой — расставьте корабли и потопите вражеский флот! 🎯',
  },
  challenge: {
    [Locale.German]: 'Einen anderen Spieler zu einem Spiel herausfordern',
    [Locale.French]: 'Défier un autre joueur à un jeu',
    [Locale.Russian]: 'Вызвать другого игрока на игру',
  },
  chess: {
    [Locale.German]: 'Schach — vollständige Regeln via chess.js, Figur & Zielfeld auswählen ♟️',
    [Locale.French]: 'Échecs — règles complètes via chess.js, sélectionnez pièce & case ♟️',
    [Locale.Russian]: 'Шахматы — полные правила, выберите фигуру и клетку ♟️',
  },
  connectfour: {
    [Locale.German]: 'Vier Gewinnt + Varianten 🔴🟡',
    [Locale.French]: 'Puissance 4 + variantes 🔴🟡',
    [Locale.Russian]: 'Четыре в ряд + варианты 🔴🟡',
  },
  dice: {
    [Locale.German]: 'Würfeln (z.B. 2d6)',
    [Locale.French]: 'Lancer des dés (ex. 2d6)',
    [Locale.Russian]: 'Бросить кубики (напр. 2d6)',
  },
  ghostsagainst: {
    [Locale.German]: 'Geister gegen Discord — Cards Against Humanity-Stil! 🃏 (3-8 Spieler)',
    [Locale.French]: 'Fantômes contre Discord — style Cards Against Humanity! 🃏 (3-8 joueurs)',
    [Locale.Russian]: 'Призраки против Discord — в стиле Cards Against Humanity! 🃏 (3-8 игроков)',
  },
  guesssong: {
    [Locale.German]: 'Errate den Song anhand von Emojis & Liedtext-Hinweisen! 🎵',
    [Locale.French]: 'Devine la chanson avec des emojis & extraits de paroles! 🎵',
    [Locale.Russian]: 'Угадай песню по эмодзи и строчкам! 🎵',
  },
  guide: {
    [Locale.German]: 'Spielanleitung für jedes Spiel anzeigen',
    [Locale.French]: 'Afficher le guide de n\'importe quel jeu',
    [Locale.Russian]: 'Показать руководство по любой игре',
  },
  hangman: {
    [Locale.German]: 'Galgenmännchen spielen',
    [Locale.French]: 'Jouer au pendu',
    [Locale.Russian]: 'Играть в виселицу',
  },
  higherorlower: {
    [Locale.German]: 'Höher oder Tiefer — rate die nächste Karte! 🃏',
    [Locale.French]: 'Plus ou Moins — devinez la prochaine carte! 🃏',
    [Locale.Russian]: 'Выше или Ниже — угадай следующую карту! 🃏',
  },
  mastermind: {
    [Locale.German]: 'Mastermind — knacke den geheimen 4-Farben-Code 🔐',
    [Locale.French]: 'Mastermind — déchiffrez le code secret à 4 couleurs 🔐',
    [Locale.Russian]: 'Мастермайнд — взломай секретный 4-цветный код 🔐',
  },
  memelord: {
    [Locale.German]: 'Memelord — schreibe die lustigste Bildunterschrift! 😂',
    [Locale.French]: 'Seigneur des mèmes — écrivez la légende la plus drôle! 😂',
    [Locale.Russian]: 'Мем-лорд — напиши самую смешную подпись! 😂',
  },
  minesweeper: {
    [Locale.German]: 'Minesweeper spielen',
    [Locale.French]: 'Jouer au démineur',
    [Locale.Russian]: 'Играть в сапёра',
  },
  numguess: {
    [Locale.German]: 'Zahl erraten (1-100)',
    [Locale.French]: 'Deviner le nombre (1-100)',
    [Locale.Russian]: 'Угадать число (1-100)',
  },
  play: {
    [Locale.German]: 'Spiel gegen die KI spielen',
    [Locale.French]: 'Jouer contre l\'IA',
    [Locale.Russian]: 'Играть против ИИ',
  },
  quiz: {
    [Locale.German]: 'Trivia-Frage mit 4 Antwortmöglichkeiten beantworten',
    [Locale.French]: 'Répondre à une question de culture générale à 4 choix',
    [Locale.Russian]: 'Ответить на вопрос викторины с 4 вариантами',
  },
  rps: {
    [Locale.German]: 'Stein Papier Schere ✊',
    [Locale.French]: 'Pierre Papier Ciseaux ✊',
    [Locale.Russian]: 'Камень Ножницы Бумага ✊',
  },
  tictactoe: {
    [Locale.German]: 'Tic-Tac-Toe spielen ❌⭕',
    [Locale.French]: 'Jouer au Tic-Tac-Toe ❌⭕',
    [Locale.Russian]: 'Играть в крестики-нолики ❌⭕',
  },
  triviaduel: {
    [Locale.German]: 'Jemanden zu einem Trivia-Duell herausfordern (Erster mit 5 Punkten gewinnt)',
    [Locale.French]: 'Défier quelqu\'un à un duel trivia (premier à 5 points gagne)',
    [Locale.Russian]: 'Вызвать на дуэль по викторине (первый до 5 очков побеждает)',
  },
  truthordare: {
    [Locale.German]: 'Wahrheit oder Pflicht 🎯',
    [Locale.French]: 'Action ou Vérité 🎯',
    [Locale.Russian]: 'Правда или действие 🎯',
  },
  uno: {
    [Locale.German]: 'UNO — das klassische Kartenspiel für 2-4 Spieler 🃏',
    [Locale.French]: 'UNO — le jeu de cartes classique pour 2-4 joueurs 🃏',
    [Locale.Russian]: 'УНО — классическая карточная игра для 2-4 игроков 🃏',
  },
  whoami: {
    [Locale.German]: 'Wer bin ich? — ein Spieler wählt eine Person, andere stellen Ja/Nein-Fragen',
    [Locale.French]: 'Qui suis-je? — un joueur choisit un personnage, les autres posent des questions',
    [Locale.Russian]: 'Кто я? — один игрок выбирает персонажа, другие задают вопросы Да/Нет',
  },
  wordle: {
    [Locale.German]: 'Tägliches Wordle — errate das 5-Buchstaben-Wort',
    [Locale.French]: 'Wordle quotidien — devinez le mot de 5 lettres',
    [Locale.Russian]: 'Ежедневный Wordle — угадай 5-буквенное слово',
  },
  wouldyourather: {
    [Locale.German]: 'Lieber... oder...? — abstimmen, diskutieren, überleben! 🤔',
    [Locale.French]: 'Tu préfères...? — voter, débattre, survivre! 🤔',
    [Locale.Russian]: 'Что лучше? — голосовать, спорить, выживать! 🤔',
  },
  yahtzee: {
    [Locale.German]: 'Yahtzee — 5 Würfel, 3 Würfe, 13 Kategorien 🎲',
    [Locale.French]: 'Yahtzee — 5 dés, 3 lancers, 13 catégories 🎲',
    [Locale.Russian]: 'Яхтзи — 5 кубиков, 3 броска, 13 категорий 🎲',
  },

  // ── Moderation ───────────────────────────────────────────────────────
  security: {
    [Locale.German]: 'Server-Sicherheit: Anti-Nuke, Anti-Raid, Auto-Defend, Ultra-Mode, Inaktivitäts-Kick, Konfiguration',
    [Locale.French]: 'Sécurité serveur : anti-nuke, anti-raid, auto-défense, mode ultra, kick inactivité, config',
    [Locale.Russian]: 'Безопасность сервера: антинюк, антирейд, автозащита, ультра-режим, кик за неактивность, настройки',
  },
  attacksim: {
    [Locale.German]: 'Vollständiger Angriffs-Simulator mit echten Discord-Aktionen (Rollback stellt alles wieder her)',
    [Locale.French]: 'Simulateur d\'attaque complet avec actions Discord réelles (rollback restaure tout)',
    [Locale.Russian]: 'Полный симулятор атаки с реальными действиями Discord (откат восстанавливает всё)',
  },
  automod: {
    [Locale.German]: 'Auto-Moderation konfigurieren',
    [Locale.French]: 'Configurer la modération automatique',
    [Locale.Russian]: 'Настроить авто-модерацию',
  },
  ban: {
    [Locale.German]: 'Einen Benutzer bannen oder entbannen',
    [Locale.French]: 'Bannir ou débannir un utilisateur',
    [Locale.Russian]: 'Забанить или разбанить пользователя',
  },
  purge: {
    [Locale.German]: 'Nachrichten löschen',
    [Locale.French]: 'Supprimer des messages',
    [Locale.Russian]: 'Удалить сообщения',
  },
  'raid-tools': {
    [Locale.German]: 'Raid-/Angriffs-Simulationstools: Raidsim, Simulate, Rollback, Beenden',
    [Locale.French]: 'Outils de simulation de raid/attaque : raidsim, simulate, rollback, fin',
    [Locale.Russian]: 'Инструменты симуляции рейдов/атак: raidsim, simulate, откат, завершение',
  },
  reactionroles: {
    [Locale.German]: 'Selbst zuweisbare Button-Rollen verwalten',
    [Locale.French]: 'Gérer les rôles auto-assignables par bouton',
    [Locale.Russian]: 'Управление ролями с кнопками самоназначения',
  },
  'mass-action': {
    [Locale.German]: 'Massenaktionen: Massen-Bann, Massen-Rolle (Raid-Kontrolle)',
    [Locale.French]: 'Actions en masse : bannissement de masse, rôle de masse (contrôle des raids)',
    [Locale.Russian]: 'Массовые действия: массбан, массроль (контроль рейдов)',
  },
  member: {
    [Locale.German]: 'Mitglieder-Aktionen: Kick, Spitzname, Rolle',
    [Locale.French]: 'Actions membre : expulsion, surnom, rôle',
    [Locale.Russian]: 'Действия с участником: кик, псевдоним, роль',
  },
  restrict: {
    [Locale.German]: 'Einschränkungs-Tools: Lockdown, Sticky-Mute, Benutzer-Slow-Modus',
    [Locale.French]: 'Outils de restriction : verrouillage, muet persistant, mode lent par utilisateur',
    [Locale.Russian]: 'Инструменты ограничений: блокировка, постоянный мут, медленный режим',
  },
  records: {
    [Locale.German]: 'Mitglieder-Akten: Verstoßhistorie, Mod-Notizen, Verwarnung-Eskalation',
    [Locale.French]: 'Dossiers membres : historique d\'infractions, notes de modo, escalade d\'avertissements',
    [Locale.Russian]: 'Записи участника: история нарушений, заметки модератора, эскалация предупреждений',
  },
  timeout: {
    [Locale.German]: 'Timeout setzen oder aufheben',
    [Locale.French]: 'Définir ou retirer une expulsion temporaire',
    [Locale.Russian]: 'Установить или снять таймаут',
  },
  warnings: {
    [Locale.German]: 'Verwarnungen verwalten — hinzufügen, anzeigen, löschen',
    [Locale.French]: 'Gérer les avertissements — ajouter, voir, effacer',
    [Locale.Russian]: 'Управление предупреждениями — добавить, показать, очистить',
  },
  channel: {
    [Locale.German]: 'Kanal-Moderation: sperren, entsperren, Slow-Modus',
    [Locale.French]: 'Modération de salon : verrouiller, déverrouiller, mode lent',
    [Locale.Russian]: 'Модерация канала: блокировка, разблокировка, медленный режим',
  },

  // ── Tickets ──────────────────────────────────────────────────────────
  'ticket-types': {
    [Locale.German]: 'Ticket-Kategorien & wiederverwendbare Typ-Vorlagen',
    [Locale.French]: 'Catégories de tickets & modèles de types réutilisables',
    [Locale.Russian]: 'Категории тикетов и многоразовые шаблоны типов',
  },
  'ticket-content': {
    [Locale.German]: 'Ticket-Formularfragen & gespeicherte Tag-Antworten',
    [Locale.French]: 'Questions du formulaire de ticket & réponses de balises sauvegardées',
    [Locale.Russian]: 'Вопросы формы тикета и сохранённые ответы-теги',
  },
  multipanel: {
    [Locale.German]: 'Bis zu 5 Ticket-Panels in einer Nachricht kombinieren',
    [Locale.French]: 'Combiner jusqu\'à 5 panneaux de tickets en un seul message',
    [Locale.Russian]: 'Объединить до 5 панелей тикетов в одно сообщение',
  },
  panel: {
    [Locale.German]: 'Ticket-Panels verwalten',
    [Locale.French]: 'Gérer les panneaux de tickets',
    [Locale.Russian]: 'Управление панелями тикетов',
  },
  settings: {
    [Locale.German]: 'Ticket-System konfigurieren',
    [Locale.French]: 'Configurer le système de tickets',
    [Locale.Russian]: 'Настроить систему тикетов',
  },
  ticket: {
    [Locale.German]: 'Ticket-Aktionen',
    [Locale.French]: 'Actions de ticket',
    [Locale.Russian]: 'Действия с тикетом',
  },
  ticketstats: {
    [Locale.German]: 'Ticket-Analysen und Mitarbeiter-Performance anzeigen',
    [Locale.French]: 'Afficher les analyses de tickets et les performances du personnel',
    [Locale.Russian]: 'Просмотр аналитики тикетов и эффективности персонала',
  },

  // ── Welcome ──────────────────────────────────────────────────────────
  simwelcome: {
    [Locale.German]: 'Willkommens-/Abschiedsnachrichten testen (nur Admins)',
    [Locale.French]: 'Simuler les messages de bienvenue/départ pour tester (admins uniquement)',
    [Locale.Russian]: 'Симулировать приветственные/прощальные сообщения для тестирования (только для админов)',
  },
  welcome: {
    [Locale.German]: 'Willkommenssystem konfigurieren',
    [Locale.French]: 'Configurer le système de bienvenue',
    [Locale.Russian]: 'Настроить систему приветствий',
  },

  // ── Application ──────────────────────────────────────────────────────
  application: {
    [Locale.German]: 'Bewerbungsformulare verwalten (bis zu 25 Fragen)',
    [Locale.French]: 'Gérer les formulaires de candidature (jusqu\'à 25 questions)',
    [Locale.Russian]: 'Управление формами заявок (до 25 вопросов)',
  },
};
