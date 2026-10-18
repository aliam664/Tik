/**
 * DOZ ONLINE — 2D engine core type contracts.
 * These interfaces describe the heavy real-time 2D game subsystem
 * (arena2d): viewport fitting, deterministic input snapshots, asset
 * manifests, live loop stats and the scene controller lifecycle.
 */

/** Static configuration of a 2D viewport / stage. */
export interface Viewport2DConfig {
  /** Logical world size the scene is authored against. */
  readonly worldWidth: number;
  readonly worldHeight: number;
  /** CSS pixel size of the host container. */
  readonly containerWidth: number;
  readonly containerHeight: number;
  /** Scale bounds (contain-fit result is clamped into this range). */
  readonly minScale?: number;
  readonly maxScale?: number;
  /** Device pixel ratio used for crisp rendering. */
  readonly devicePixelRatio?: number;
}

/** Result of fitting the world into the container (contain strategy). */
export interface ViewportFit2D {
  /** Uniform scale applied to world → screen. */
  readonly scale: number;
  /** Centering offsets in CSS pixels (letterboxing). */
  readonly offsetX: number;
  readonly offsetY: number;
  /** Visible viewport size in CSS pixels. */
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  /** Visible region expressed in world units. */
  readonly visibleWorldWidth: number;
  readonly visibleWorldHeight: number;
  /** Backing store size (CSS px × dpr). */
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly devicePixelRatio: number;
}

/**
 * Immutable capture of all player inputs for one tick. Kept serializable
 * so replays and lockstep simulations can reconstruct the exact frame.
 */
export interface InputSnapshot2D {
  /** Monotonic input sequence number (per client). */
  readonly seq: number;
  /** Simulation tick the snapshot belongs to. */
  readonly tick: number;
  /** Sorted set of currently pressed key codes. */
  readonly keys: readonly number[];
  /** Pointer position in world coordinates. */
  readonly pointerX: number;
  readonly pointerY: number;
  /** Primary pointer button held down. */
  readonly pointerDown: boolean;
  /** Bitmask of pressed pointer buttons (1=left, 2=middle, 4=right). */
  readonly buttons: number;
}

/** Manifest of every asset a scene needs; verified before launch. */
export interface AssetManifest2D {
  readonly version: string;
  readonly checksum: string;
  readonly spritesheet?: {
    readonly url: string;
    readonly tileWidth: number;
    readonly tileHeight: number;
    readonly columns: number;
    readonly rows: number;
  };
  readonly sounds?: readonly string[];
  readonly fonts?: readonly {
    readonly family: string;
    readonly weight: number;
    readonly url: string;
  }[];
}

/** Live performance counters emitted by the game loop. */
export interface GameLoopStats2D {
  /** Smoothed frames-per-second (EMA over recent frames). */
  readonly fps: number;
  /** Smoothed frame time in milliseconds. */
  readonly frameTimeMs: number;
  /** Nominal simulation rate (e.g. 60Hz fixed timestep). */
  readonly tickHz: number;
  /** Total simulation ticks executed since start. */
  readonly ticks: number;
  /** Total frames rendered since start. */
  readonly frames: number;
  /** Frames that exceeded the sub-step budget (spiral-of-death guard). */
  readonly droppedFrames: number;
  /** Interpolation factor passed to the renderer (0..<1). */
  readonly alpha: number;
  /** Duration of the most recent tick in milliseconds. */
  readonly lastTickDurationMs: number;
  /** High-resolution timestamp of the last processed frame. */
  readonly lastFrameAtMs: number;
}

/** 2D drawing context abstraction (kept minimal for testability). */
export interface RenderContext2D {
  readonly width: number;
  readonly height: number;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
}

/** Scene lifecycle controller plugged into the game loop. */
export interface Scene2DController {
  readonly id: string;
  /** Called once when the scene becomes active. */
  onEnter?(): void | Promise<void>;
  /** Called exactly once per fixed simulation tick (deterministic dt). */
  onUpdate(dtSeconds: number, input: InputSnapshot2D): void;
  /** Called once per rendered frame; `alpha` blends tick states. */
  onRender(ctx: RenderContext2D, alpha: number): void;
  /** Called when the fitted viewport changes (resize / DPR change). */
  onResize?(fit: ViewportFit2D): void;
  /** Called once when the scene is deactivated. */
  onExit?(): void;
}
