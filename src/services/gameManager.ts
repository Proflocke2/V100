/**
 * GAME MANAGER
 * central state management for PvP/PvE games and invites
 * supports multiple concurrent games
 */

import { Message, User } from 'discord.js';

// ============================================================================
// TYPES
// ============================================================================

export type GameType = 'tictactoe' | 'connectfour' | 'rps';
export type GameMode = 'pvp' | 'pve';
export type GameStatus = 'waiting' | 'active' | 'finished';

export interface ActiveGame {
  gameId: string;
  type: GameType;
  mode: GameMode;
  channelId: string;
  messageId?: string;
  player1Id: string;
  player2Id: string | 'AI'; // 'AI' for PvE
  currentTurn: string;       // userId or 'AI'
  state: any;                // game-specific state (board, etc)
  status: GameStatus;
  createdAt: number;
  lastMoveAt: number;
}

export interface GameInvite {
  inviteId: string;
  type: GameType;
  channelId: string;
  messageId?: string;
  inviterId: string;
  invitedId: string;
  createdAt: number;
  expiresAt: number;
}

// ============================================================================
// GAME MANAGER (Singleton)
// ============================================================================

export class GameManager {
  // active games stored by gameId
  private static games = new Map<string, ActiveGame>();
  
  // pending invites stored by inviteId
  private static invites = new Map<string, GameInvite>();
  
  // tracks which user is currently in which game (1 game per user max)
  private static playerGameMap = new Map<string, string>();

  // invites expire after 60 seconds
  private static readonly INVITE_TTL = 60 * 1000;

  // games auto-end after 10 minutes of inactivity
  private static readonly GAME_TIMEOUT = 10 * 60 * 1000;

  /**
   * Initialize - sets up cleanup intervals
   */
  static initialize(): void {
    // cleanup expired invites and stale games every 30 seconds
    setInterval(() => this.cleanup(), 30 * 1000);
  }

  // ==========================================================================
  // INVITE MANAGEMENT
  // ==========================================================================

  /**
   * Create a new game invite
   */
  static createInvite(
    inviterId: string,
    invitedId: string,
    type: GameType,
    channelId: string
  ): GameInvite | { error: string } {
    // check if inviter already in a game
    if (this.playerGameMap.has(inviterId)) {
      return { error: 'You are already in a game!' };
    }

    // check if invited user already in a game
    if (this.playerGameMap.has(invitedId)) {
      return { error: 'That user is already in a game' };
    }

    // check if there's already a pending invite for this pair
    for (const invite of this.invites.values()) {
      if (
        (invite.inviterId === inviterId && invite.invitedId === invitedId) ||
        (invite.inviterId === invitedId && invite.invitedId === inviterId)
      ) {
        return { error: 'There is already a pending invite between you two' };
      }
    }

    const inviteId = `inv_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const invite: GameInvite = {
      inviteId,
      type,
      channelId,
      inviterId,
      invitedId,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.INVITE_TTL,
    };

    this.invites.set(inviteId, invite);
    return invite;
  }

  /**
   * Get an invite by ID
   */
  static getInvite(inviteId: string): GameInvite | null {
    const invite = this.invites.get(inviteId);
    if (!invite) return null;
    if (Date.now() > invite.expiresAt) {
      this.invites.delete(inviteId);
      return null;
    }
    return invite;
  }

  /**
   * Update invite with the message ID after sending
   */
  static setInviteMessage(inviteId: string, messageId: string): void {
    const invite = this.invites.get(inviteId);
    if (invite) invite.messageId = messageId;
  }

  /**
   * Remove an invite
   */
  static removeInvite(inviteId: string): void {
    this.invites.delete(inviteId);
  }

  // ==========================================================================
  // GAME MANAGEMENT
  // ==========================================================================

  /**
   * Create a new active game (called after invite accepted or PvE start)
   */
  static createGame(input: {
    type: GameType;
    mode: GameMode;
    channelId: string;
    player1Id: string;
    player2Id: string | 'AI';
    initialState: any;
  }): ActiveGame {
    const gameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    const game: ActiveGame = {
      gameId,
      type: input.type,
      mode: input.mode,
      channelId: input.channelId,
      player1Id: input.player1Id,
      player2Id: input.player2Id,
      currentTurn: input.player1Id, // player 1 starts
      state: input.initialState,
      status: 'active',
      createdAt: Date.now(),
      lastMoveAt: Date.now(),
    };

    this.games.set(gameId, game);
    
    // mark players as in-game (skip AI)
    this.playerGameMap.set(input.player1Id, gameId);
    if (input.player2Id !== 'AI') {
      this.playerGameMap.set(input.player2Id, gameId);
    }

    return game;
  }

  /**
   * Get a game by ID
   */
  static getGame(gameId: string): ActiveGame | null {
    return this.games.get(gameId) || null;
  }

  /**
   * Get game by user ID (returns the game they're in, if any)
   */
  static getGameByUser(userId: string): ActiveGame | null {
    const gameId = this.playerGameMap.get(userId);
    if (!gameId) return null;
    return this.getGame(gameId);
  }

  /**
   * Update game state after a move
   */
  static updateGame(gameId: string, updates: Partial<ActiveGame>): ActiveGame | null {
    const game = this.games.get(gameId);
    if (!game) return null;

    Object.assign(game, updates);
    game.lastMoveAt = Date.now();
    return game;
  }

  /**
   * Switch turn between players
   */
  static switchTurn(gameId: string): string {
    const game = this.games.get(gameId);
    if (!game) return '';
    
    game.currentTurn = game.currentTurn === game.player1Id 
      ? (game.player2Id === 'AI' ? 'AI' : game.player2Id)
      : game.player1Id;
    
    game.lastMoveAt = Date.now();
    return game.currentTurn;
  }

  /**
   * Set the discord message ID for a game
   */
  static setGameMessage(gameId: string, messageId: string): void {
    const game = this.games.get(gameId);
    if (game) game.messageId = messageId;
  }

  /**
   * End a game and clean up player mappings
   */
  static endGame(gameId: string): void {
    const game = this.games.get(gameId);
    if (!game) return;

    // remove players from in-game map
    this.playerGameMap.delete(game.player1Id);
    if (game.player2Id !== 'AI') {
      this.playerGameMap.delete(game.player2Id);
    }

    game.status = 'finished';
    
    // keep game in memory for 30 seconds for any final operations
    setTimeout(() => this.games.delete(gameId), 30000);
  }

  // ==========================================================================
  // STATS & UTILITIES
  // ==========================================================================

  /**
   * Get count of active games
   */
  static getActiveGameCount(): number {
    return this.games.size;
  }

  /**
   * Get count of pending invites
   */
  static getPendingInviteCount(): number {
    return this.invites.size;
  }

  /**
   * Check if a user is currently in a game
   */
  static isUserInGame(userId: string): boolean {
    return this.playerGameMap.has(userId);
  }

  /**
   * Cleanup expired invites and stale games
   */
  private static cleanup(): void {
    const now = Date.now();

    // clean expired invites
    for (const [id, invite] of this.invites.entries()) {
      if (now > invite.expiresAt) {
        this.invites.delete(id);
      }
    }

    // clean stale games (no activity for 10 minutes)
    for (const [id, game] of this.games.entries()) {
      if (now - game.lastMoveAt > this.GAME_TIMEOUT && game.status === 'active') {
        this.endGame(id);
      }
    }
  }
}

export default GameManager;
