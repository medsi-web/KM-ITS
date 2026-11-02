import type { ReactNode } from "react";
import { rect } from "./geometry";

/** A design frame plus its navy footer band. Children are positioned in frame % units. */
export default function Frame({
  id,
  label,
  children,
}: {
  id?: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-label={label} className="pf-stage">
      <div className="pf-canvas">
        {children}
        <div className="pf-footer" style={rect(0, 491.12, 963.594, 64.24)} />
      </div>
    </section>
  );
}
