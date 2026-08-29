import type { EntityId, SaveHealth, Size } from "../domain/models";

export const SKETCH_SCHEMA_VERSION = 1 as const;

export type SketchTool = "pen" | "eraser";
export type PenNib = "pen" | "marker" | "pencil" | "brush";

export type PencilSample = {
  x: number;
  y: number;
  pressure: number;
  timestamp: number;
  tiltX?: number;
  tiltY?: number;
};

export type SketchStroke = {
  id: EntityId;
  tool: "pen";
  nib?: PenNib;
  points: PencilSample[];
  color: string;
  width: number;
  opacity?: number;
  createdAt: string;
};

export type SketchDocument = {
  schemaVersion: typeof SKETCH_SCHEMA_VERSION;
  id: EntityId;
  size: Size;
  strokes: SketchStroke[];
  revision: number;
};

export type SketchCapabilityProfile =
  | {
      kind: "ipad";
      tools: readonly ["pen", "eraser"];
      fingerDrawing: boolean;
      pressure: true;
    }
  | {
      kind: "iphone";
      tools: readonly ["pen", "eraser"];
      fingerDrawing: boolean;
      pressure: false;
    }
  | {
      kind: "readonly";
      tools: readonly [];
      fingerDrawing: false;
      pressure: false;
    };

export interface SketchRepository {
  load(documentId: EntityId): Promise<SketchDocument>;
  save(document: SketchDocument): Promise<SaveHealth>;
  remove?(documentId: EntityId): Promise<void>;
  subscribe?(
    documentId: EntityId,
    listener: () => void,
  ): () => void;
}

export type SketchSurfaceError = {
  code:
    | "canvas-unavailable"
    | "pointer-cancelled"
    | "storage-failed"
    | "unsupported-input";
  message: string;
  recoverable: boolean;
};
