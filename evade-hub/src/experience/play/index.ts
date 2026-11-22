// Mini games inside 3D and AR (round 3): Heart Run and Heart Hoops. The experience owns ONE PlayDirector; a game runs
// in the mode that was live when it started (the mode hands it a PlayHost) and is torn down on stopPlay, a mode
// switch, Start again or dispose. See docs/handoff/games-3.md.
import type { PlayGameId, PlayGameInfo, PlayStatus } from '../../shared/contracts';
import { PlayGame, readBest, type PauseReason, type PlayHost } from './game';
import { HeartRun } from './run';
import { HeartHoops } from './hoops';

export { PlayKit } from './kit';
export type { PlayHost, PauseReason } from './game';
export { PlayGame } from './game';
export { SVG as PLAY_SVG } from './ui';

export const PLAY_GAMES: readonly PlayGameInfo[] = [
  { id: 'heart-run', label: 'Parade Dash', lead: 'Dash Happi round the square and catch cherry blossoms and fans in 60 seconds.' },
  { id: 'heart-hoops', label: 'Blossom Toss', lead: 'Swipe up to toss 10 blossoms through the festival ring.' },
];

/** What a mode offers the director. */
export interface PlayMode {
  /** Null when the mode cannot host a game right now. */
  playHost(): PlayHost | null;
  /** The mode runs this game every frame (null = back to free play). */
  setGame(game: PlayGame | null): void;
}

export class PlayDirector {
  game: PlayGame | null = null;
  private mode: PlayMode | null = null;
  private idle: PlayStatus = { id: null, state: 'idle', score: 0, best: 0, timeLeft: null };

  constructor(private emit: (s: PlayStatus) => void, private desktop: boolean) {}

  start(id: PlayGameId, mode: PlayMode): boolean {
    const host = mode.playHost();
    if (!host || !PLAY_GAMES.some((g) => g.id === id)) return false;
    this.stop();
    const exit = () => this.stop();
    const g = id === 'heart-run' ? new HeartRun(host, this.emit, exit) : new HeartHoops(host, this.emit, exit, this.desktop);
    this.game = g;
    this.mode = mode;
    mode.setGame(g);
    g.begin();
    return true;
  }

  stop(): void {
    const g = this.game;
    if (!g) return;
    this.game = null;
    const m = this.mode;
    this.mode = null;
    g.dispose();
    m?.setGame(null);
    this.emit({ ...this.idle, best: readBest(g.id) });
  }

  pause(reason: PauseReason = 'user'): boolean {
    return this.game?.pause(reason) ?? false;
  }

  resume(reason: PauseReason | 'all' = 'all'): boolean {
    return this.game?.resume(reason) ?? false;
  }

  again(): boolean {
    return this.game?.again() ?? false;
  }

  status(): PlayStatus {
    return this.game?.status() ?? this.idle;
  }
}
