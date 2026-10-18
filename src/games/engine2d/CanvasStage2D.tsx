/**
 * DOZ ONLINE — React stage for the 2D engine.
 *
 * Hosts a <canvas>, fits the fixed world into the container
 * (contain strategy, DPR-aware) and drives the deterministic
 * fixed-timestep GameLoop2D. The scene controller receives
 * simulated time, interpolated render passes and resize events.
 */

import { useEffect, useRef } from "react";
import {
  GameLoop2D,
  computeViewportFit2D,
  DEFAULT_TICK_HZ,
  DEFAULT_MAX_SUB_STEPS,
} from "./GameLoop2D";
import type {
  InputSnapshot2D,
  RenderContext2D,
  Scene2DController,
  ViewportFit2D,
} from "./types";

export interface CanvasStage2DProps {
  /** Scene implementing the simulation + render logic. */
  readonly scene: Scene2DController;
  /** Logical world size the scene is authored against. */
  readonly worldWidth: number;
  readonly worldHeight: number;
  /** Simulation rate (default 60Hz fixed timestep). */
  readonly tickHz?: number;
  /** Max simulation ticks per frame (spiral-of-death guard). */
  readonly maxSubSteps?: number;
  readonly className?: string;
  readonly ariaLabel?: string;
}

const EMPTY_INPUT: InputSnapshot2D = {
  seq: 0,
  tick: 0,
  keys: [],
  pointerX: 0,
  pointerY: 0,
  pointerDown: false,
  buttons: 0,
};

/** Adapt the DOM 2D context to the engine's minimal contract. */
function adaptContext(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): RenderContext2D {
  return {
    get width() {
      return canvas.width;
    },
    get height() {
      return canvas.height;
    },
    save: () => ctx.save(),
    restore: () => ctx.restore(),
    translate: (x, y) => ctx.translate(x, y),
    scale: (x, y) => ctx.scale(x, y),
    clearRect: (x, y, w, h) => ctx.clearRect(x, y, w, h),
  };
}

export function CanvasStage2D({
  scene,
  worldWidth,
  worldHeight,
  tickHz = DEFAULT_TICK_HZ,
  maxSubSteps = DEFAULT_MAX_SUB_STEPS,
  className,
  ariaLabel = "بازی دوبعدی",
}: CanvasStage2DProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fitRef = useRef<ViewportFit2D | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const applyFit = () => {
      const parent = canvas.parentElement;
      const containerWidth = parent ? parent.clientWidth : canvas.clientWidth;
      const containerHeight = parent ? parent.clientHeight : canvas.clientHeight;
      const fit = computeViewportFit2D({
        worldWidth,
        worldHeight,
        containerWidth,
        containerHeight,
        devicePixelRatio: window.devicePixelRatio || 1,
      });
      fitRef.current = fit;
      canvas.width = fit.pixelWidth;
      canvas.height = fit.pixelHeight;
      scene.onResize?.(fit);
    };

    const renderCtx = adaptContext(canvas, ctx);
    const inputRef: { current: InputSnapshot2D } = { current: { ...EMPTY_INPUT } };

    const loop = new GameLoop2D({
      tickHz,
      maxSubSteps,
      update: (dtSeconds) => {
        inputRef.current = { ...inputRef.current, tick: loop.getStats().ticks };
        scene.onUpdate(dtSeconds, inputRef.current);
      },
      render: (alpha) => {
        const fit = fitRef.current;
        if (!fit) return;
        ctx.setTransform(
          fit.devicePixelRatio,
          0,
          0,
          fit.devicePixelRatio,
          0,
          0,
        );
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.translate(fit.offsetX, fit.offsetY);
        ctx.scale(fit.scale, fit.scale);
        scene.onRender(renderCtx, alpha);
      },
    });

    const resizeObserver = new ResizeObserver(() => applyFit());
    resizeObserver.observe(canvas.parentElement ?? canvas);

    const handlePointer = (e: PointerEvent) => {
      const fit = fitRef.current;
      if (!fit) return;
      const rect = canvas.getBoundingClientRect();
      inputRef.current = {
        ...inputRef.current,
        pointerX: (e.clientX - rect.left - fit.offsetX) / fit.scale,
        pointerY: (e.clientY - rect.top - fit.offsetY) / fit.scale,
        pointerDown: e.buttons > 0,
        buttons: e.buttons,
      };
    };
    canvas.addEventListener("pointermove", handlePointer);
    canvas.addEventListener("pointerdown", handlePointer);
    canvas.addEventListener("pointerup", handlePointer);

    applyFit();
    void scene.onEnter?.();
    loop.start();

    return () => {
      loop.stop();
      resizeObserver.disconnect();
      canvas.removeEventListener("pointermove", handlePointer);
      canvas.removeEventListener("pointerdown", handlePointer);
      canvas.removeEventListener("pointerup", handlePointer);
      void scene.onExit?.();
    };
  }, [scene, worldWidth, worldHeight, tickHz, maxSubSteps]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-label={ariaLabel}
      role="img"
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  );
}
