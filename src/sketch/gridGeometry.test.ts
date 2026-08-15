import { describe, expect, it, vi } from "vitest";

import { GRID_ROTATION_MAX } from "../domain/models";
import {
  clampGridRotation,
  drawGrid,
  gridAxisForSample,
  gridLineOffsets,
  snapSampleToGrid,
} from "./gridGeometry";
import type { PencilSample } from "./types";

const point = (x: number, y: number): PencilSample => ({
  x,
  y,
  pressure: 0.5,
  timestamp: 0,
});

describe("drawing grid geometry", () => {
  it("locks a horizontal stroke to the nearest straight grid line", () => {
    const snapped = snapSampleToGrid(
      point(130, 77),
      point(10, 68),
      {
        enabled: true,
        spacing: 60,
        rotationDegrees: 0,
        type: "lines",
        color: "#435b70",
      },
      "horizontal",
    );
    expect(snapped.x).toBeCloseTo(130);
    expect(snapped.y).toBeCloseTo(60);
  });

  it("recognises directions in a rotated grid", () => {
    expect(gridAxisForSample(point(80, 80), point(0, 0), 45)).toBe("horizontal");
    expect(gridAxisForSample(point(-80, 80), point(0, 0), 45)).toBe("vertical");
  });

  it("snaps to a lattice centred on the canvas", () => {
    const snapped = snapSampleToGrid(
      point(150, 92),
      point(110, 88),
      {
        enabled: true,
        spacing: 60,
        rotationDegrees: 0,
        type: "lines",
        color: "#435b70",
      },
      "horizontal",
      { x: 100, y: 80 },
    );

    expect(snapped.x).toBeCloseTo(150);
    expect(snapped.y).toBeCloseTo(80);
  });

  it.each([36, 60, 96] as const)(
    "renders every %s-point guide line on the same zero-based lattice used for snapping",
    (spacing) => {
      const offsets = gridLineOffsets(Math.hypot(1200, 820), spacing);
      expect(offsets).toContain(0);
      expect(offsets.length).toBeGreaterThan(2);
      for (const offset of offsets) {
        expect(offset / spacing).toBeCloseTo(Math.round(offset / spacing), 10);
      }
    },
  );

  it.each([-75, -60, -45, -30, -15, 0, 15, 30, 45, 60, 75] as const)(
    "snapped strokes land on the visible lattice at %s degrees",
    (rotationDegrees) => {
      const spacing = 60;
      const snapped = snapSampleToGrid(
        point(347, 211),
        point(113, 97),
        {
          enabled: true,
          spacing,
          rotationDegrees,
          type: "lines",
          color: "#435b70",
        },
        "horizontal",
      );
      const angle = (rotationDegrees * Math.PI) / 180;
      const localY = -snapped.x * Math.sin(angle) + snapped.y * Math.cos(angle);
      expect(localY / spacing).toBeCloseTo(Math.round(localY / spacing), 10);
      expect(gridLineOffsets(Math.hypot(1200, 820), spacing)).toContain(
        Math.round(localY / spacing) * spacing,
      );
    },
  );

  it("keeps every 15 degree drawing step the HUD can select", () => {
    expect(GRID_ROTATION_MAX).toBe(75);
    expect([0, 15, 30, 45, 60, 75].map(clampGridRotation)).toEqual([
      0, 15, 30, 45, 60, 75,
    ]);
    expect(clampGridRotation(90)).toBe(75);
    expect(clampGridRotation(-90)).toBe(-75);
  });

  it("renders visible dots using the selected grid colour", () => {
    const context = {
      arc: vi.fn(),
      beginPath: vi.fn(),
      fill: vi.fn(),
      fillStyle: "",
      moveTo: vi.fn(),
      restore: vi.fn(),
      rotate: vi.fn(),
      save: vi.fn(),
      stroke: vi.fn(),
      strokeStyle: "",
      translate: vi.fn(),
      lineWidth: 0,
    } as unknown as CanvasRenderingContext2D;

    drawGrid(context, 120, 80, {
      enabled: true,
      spacing: 60,
      rotationDegrees: 15,
      type: "dots",
      color: "#884422",
    });

    expect(context.arc).toHaveBeenCalled();
    expect(context.fill).toHaveBeenCalledOnce();
    expect(context.stroke).not.toHaveBeenCalled();
    expect(context.fillStyle).toBe("rgba(136, 68, 34, 0.48)");
    expect(context.translate).toHaveBeenCalledWith(60, 40);
  });
});
