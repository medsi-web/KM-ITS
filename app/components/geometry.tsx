import type { CSSProperties, ReactNode } from "react";

/** Size of the "Homepage" / "Feature-option" frames in Figma. */
export const FRAME_W = 963.3637;
export const FRAME_H = 541.8921;

/** Position a box given in Figma px as percentages of its parent frame. */
export function rect(
  left: number,
  top: number,
  width: number,
  height: number,
  w = FRAME_W,
  h = FRAME_H,
): CSSProperties {
  return {
    left: `${(left / w) * 100}%`,
    top: `${(top / h) * 100}%`,
    width: `${(width / w) * 100}%`,
    height: `${(height / h) * 100}%`,
  };
}

/** Same order as CSS `inset`: top, right, bottom, left (all in %). */
export function inset(
  top: number,
  right: number,
  bottom: number,
  left: number,
): CSSProperties {
  return { inset: `${top}% ${right}% ${bottom}% ${left}%` };
}

/** Font size in Figma px, scaled with the frame. */
export const px = (n: number) => `calc(var(--u) * ${n})`;

type TiltedProps = {
  box: CSSProperties;
  angle: number;
  /** [cqw, cqh] terms of the rotated element's width / height (Figma export). */
  width: [number, number];
  height: [number, number];
  flipX?: boolean;
  children: ReactNode;
};

/**
 * A rotated element that Figma stores by its unrotated bounding box. The inner
 * size is derived from the container with hypot() so the rotated shape fills
 * the box exactly as in the design.
 */
export function Tilted({
  box,
  angle,
  width,
  height,
  flipX,
  children,
}: TiltedProps) {
  return (
    <div
      style={{
        position: "absolute",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        containerType: "size",
        ...box,
      }}
    >
      <div
        style={{
          position: "relative",
          flex: "none",
          width: `hypot(${width[0]}cqw, ${width[1]}cqh)`,
          height: `hypot(${height[0]}cqw, ${height[1]}cqh)`,
          rotate: `${angle}deg`,
          scale: flipX ? "-1 1" : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}
