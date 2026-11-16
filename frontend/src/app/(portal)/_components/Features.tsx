import Image from "next/image";
import Link from "next/link";
import type { ComponentProps, CSSProperties, ReactNode } from "react";
import { Layer } from "./Canvas";
import {
  FEATURES_H,
  HERO_H,
  inset,
  px,
  rectIn,
  Tilted,
} from "@/app/_components/geometry";

const rect = rectIn(FEATURES_H);

const centered = (size: number, weight: number): CSSProperties => ({
  margin: 0,
  width: "100%",
  height: "100%",
  textAlign: "center",
  color: "#fff",
  fontSize: px(size),
  fontWeight: weight,
  lineHeight: "normal",
});

/** Round tinted icon badge. `rotation` is the net rotation of the glyph inside it. */
function Badge({
  left,
  top,
  size,
  icon,
  iconSize,
  rotation,
}: {
  left: number;
  top: number;
  size: number;
  icon: string;
  iconSize: [number, number];
  rotation: number;
}) {
  return (
    <div
      className="pf-abs"
      style={{
        ...rect(left, top, size, size),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          position: "relative",
          width: "92.47%",
          height: "92.47%",
          borderRadius: "50%",
          background: "var(--color-icon-tint)",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: `${(iconSize[0] / (size * 0.9247)) * 100}%`,
            height: `${(iconSize[1] / (size * 0.9247)) * 100}%`,
            translate: "-50% -50%",
            rotate: `${rotation}deg`,
          }}
        >
          <Image src={icon} alt="" fill />
        </div>
      </div>
    </div>
  );
}

type TiltedShape = Omit<ComponentProps<typeof Tilted>, "children">;

/**
 * One clickable card. The whole group (background, badge, texts) lives inside a
 * single link, so hovering the text counts as hovering the card. The hit area is
 * a static copy of the card shape; only the visual body moves on hover, which
 * keeps the pointer from flickering at the card edges.
 */
function Card({
  href,
  label,
  origin,
  shape,
  children,
}: {
  href: string;
  label: string;
  /** Centre of the card in frame %, so the pop scales around the card itself. */
  origin: string;
  shape: TiltedShape;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="pf-card"
      style={{ "--card-origin": origin } as CSSProperties}
    >
      <Tilted {...shape}>
        <span className="pf-card-hit" />
      </Tilted>
      <div className="pf-card-body">{children}</div>
    </Link>
  );
}

export default function Features() {
  return (
    <Layer id="features" top={HERO_H} height={FEATURES_H}>
      {/* Batik band behind the cards */}
      <div className="pf-abs" style={inset(43.88, 37.32, 23.73, 37.44)}>
        <Image src="/portal/batik-filled-1.svg" alt="" fill sizes="30vw" />
      </div>
      <Tilted
        box={inset(44.09, 11.09, 20.9, 62.75)}
        angle={3.21}
        width={[96.3264, 7.62586]}
        height={[-3.67356, 92.3741]}
      >
        <Image src="/portal/batik-filled-2.svg" alt="" fill sizes="30vw" />
      </Tilted>
      <Tilted
        box={inset(46.73, -14.09, 18.26, 87.93)}
        angle={3.21}
        width={[96.3264, 7.62586]}
        height={[-3.67356, 92.3741]}
      >
        <Image src="/portal/batik-filled-3.svg" alt="" fill sizes="30vw" />
      </Tilted>
      <Tilted
        box={inset(43.88, 62.65, 21.11, 11.19)}
        angle={-3.21}
        flipX
        width={[-96.3264, 7.62586]}
        height={[3.67356, 92.3741]}
      >
        <Image src="/portal/batik-filled-4.svg" alt="" fill sizes="30vw" />
      </Tilted>
      <Tilted
        box={inset(46.52, 87.83, 18.46, -13.99)}
        angle={-3.21}
        flipX
        width={[-96.3264, 7.62586]}
        height={[3.67356, 92.3741]}
      >
        <Image src="/portal/batik-filled-5.svg" alt="" fill sizes="30vw" />
      </Tilted>

      {/* Heading */}
      <p
        className="pf-abs"
        style={{
          ...rect(439.3, 97.4, 83.9, 14.5),
          fontSize: px(12.433),
          fontWeight: 600,
          color: "var(--color-sky)",
          textAlign: "center",
          whiteSpace: "nowrap",
        }}
      >
        Portal KM ITS
      </p>
      <h2
        className="pf-heading"
        style={{
          ...rect(240.4, 111.9, 481.8, 32.1),
          fontSize: px(33.156),
          color: "var(--color-navy)",
          textAlign: "center",
          whiteSpace: "nowrap",
        }}
      >
        Apa yang Bisa Kamu Lakukan
      </h2>

      {/* Card 1: Knowledge */}
      <Card
        href="/knowledge"
        label="KM ITS Knowledge"
        origin="32.17% 53.74%"
        shape={{
          box: inset(36.07, 59.65, 28.6, 23.99),
          angle: -4.74,
          width: [91.1453, -6.59852],
          height: [8.85467, 93.4015],
        }}
      >
        <Tilted
          box={inset(36.07, 59.65, 28.6, 23.99)}
          angle={-4.74}
          width={[91.1453, -6.59852]}
          height={[8.85467, 93.4015]}
        >
          <Image className="pf-card-bg" src="/portal/card-bg-2.svg" alt="" fill />
        </Tilted>
        <Badge
          left={287.01}
          top={206.19}
          size={30.268}
          icon="/portal/icon-knowledge.svg"
          iconSize={[15.9558, 12.7323]}
          rotation={-5.99}
        />
        <Tilted
          box={inset(47.34, 63.75, 46.03, 27.33)}
          angle={-4.76}
          width={[97.3965, -20.5994]}
          height={[2.60346, 79.4006]}
        >
          <p style={centered(12.433, 600)}>KM ITS Knowledge</p>
        </Tilted>
        <Tilted
          box={inset(55.67, 63.94, 38.8, 28.19)}
          angle={-4.51}
          width={[97.6733, -20.6733]}
          height={[2.32673, 79.3267]}
        >
          <p style={centered(10.361, 400)}>Temukan Arsip KM ITS</p>
        </Tilted>
      </Card>

      {/* Card 2: Timeline */}
      <Card
        href="#"
        label="Integrated Timeline KM ITS"
        origin="50.03% 52.5%"
        shape={{
          box: inset(35.96, 42.49, 30.93, 42.55),
          angle: 0,
          width: [100, 0],
          height: [0, 100],
        }}
      >
        <div className="pf-abs" style={inset(35.96, 42.49, 30.93, 42.55)}>
          <Image className="pf-card-bg" src="/portal/card-bg-4.svg" alt="" fill />
        </div>
        <Badge
          left={467.29}
          top={198.94}
          size={28.195}
          icon="/portal/icon-timeline.svg"
          iconSize={[14.538, 14.5383]}
          rotation={0}
        />
        <p
          className="pf-abs"
          style={{
            ...inset(45.71, 45.67, 49.01, 45.62),
            margin: 0,
            textAlign: "center",
            color: "#fff",
            fontSize: px(12.433),
            fontWeight: 600,
            lineHeight: "normal",
          }}
        >
          Integrated
          <br />
          Timeline KM ITS
        </p>
        <p
          className="pf-abs"
          style={{
            ...inset(56.68, 45.02, 38.85, 45.08),
            margin: 0,
            textAlign: "center",
            color: "#fff",
            fontSize: px(10.361),
            lineHeight: "normal",
          }}
        >
          Lihat Agenda Kegiatan Ormawa
        </p>
      </Card>

      {/* Card 3: News */}
      <Card
        href="/news"
        label="KM ITS News"
        origin="67.95% 54.04%"
        shape={{
          box: inset(36.37, 23.88, 28.3, 59.77),
          angle: 4.74,
          flipX: true,
          width: [-91.1453, -6.59852],
          height: [-8.85467, 93.4015],
        }}
      >
        <Tilted
          box={inset(36.37, 23.88, 28.3, 59.77)}
          angle={4.74}
          flipX
          width={[-91.1453, -6.59852]}
          height={[-8.85467, 93.4015]}
        >
          <Image className="pf-card-bg" src="/portal/card-bg-3.svg" alt="" fill />
        </Tilted>
        <Badge
          left={644.47}
          top={211.37}
          size={30.268}
          icon="/portal/icon-news.svg"
          iconSize={[16.4071, 14.7457]}
          rotation={7.9}
        />
        <Tilted
          box={inset(48.35, 27.29, 47.66, 63.91)}
          angle={4.76}
          width={[98.6871, 34.2563]}
          height={[-1.31292, 65.7437]}
        >
          <p style={centered(12.433, 600)}>KM ITS News</p>
        </Tilted>
        <Tilted
          box={inset(54.45, 28.16, 39.77, 63.05)}
          angle={4.67}
          width={[97.8075, 22.9261]}
          height={[-2.1925, 77.0739]}
        >
          <p style={centered(10.361, 400)}>Baca Berita Terbaru dari BEM ITS</p>
        </Tilted>
      </Card>

      {/* CTA label */}
      <div
        className="pf-button"
        style={rect(380.2, 388.54, 202.044, 30.048)}
        aria-hidden
      />
      <p
        className="pf-abs"
        style={{
          ...inset(77.81, 43.08, 19.34, 43.14),
          margin: 0,
          textAlign: "right",
          color: "#fff",
          fontSize: px(12.433),
          fontWeight: 600,
          whiteSpace: "nowrap",
        }}
      >
        Pilih 1 untuk memulai
      </p>
    </Layer>
  );
}
