import type { ReactNode } from "react";
import { FRAME_H } from "@/app/_components/geometry";

/** The whole homepage as one Figma frame. Layers are stacked in frame % units. */
export default function Canvas({ children }: { children: ReactNode }) {
  return (
    <div className="pf-stage">
      <div className="pf-canvas">{children}</div>
    </div>
  );
}

/** A clipped horizontal band of the canvas. `top` and `height` are in Figma px. */
export function Layer({
  id,
  top,
  height,
  children,
}: {
  id?: string;
  top: number;
  height: number;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      className="pf-layer"
      style={{
        top: `${(top / FRAME_H) * 100}%`,
        height: `${(height / FRAME_H) * 100}%`,
      }}
    >
      {children}
    </div>
  );
}
