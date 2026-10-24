import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import Frame from "./Frame";
import { inset, px, rect, Tilted } from "./geometry";

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

export default function Features() {
  return (
    <Frame id="fitur" label="Pilihan fitur">
      {/* Batik band behind the cards */}
      <div className="pf-abs" style={inset(41.3, 37.34, 28.21, 37.43)}>
        <Image src="/portal/batik-filled-1.svg" alt="" fill sizes="30vw" />
      </div>
      <Tilted
        box={inset(41.49, 11.12, 25.56, 62.73)}
        angle={3.21}
        width={[96.3264, 7.62586]}
        height={[-3.67356, 92.3741]}
      >
        <Image src="/portal/batik-filled-2.svg" alt="" fill sizes="30vw" />
      </Tilted>
      <Tilted
        box={inset(43.98, -14.05, 23.07, 87.9)}
        angle={3.21}
        width={[96.3264, 7.62586]}
        height={[-3.67356, 92.3741]}
      >
        <Image src="/portal/batik-filled-3.svg" alt="" fill sizes="30vw" />
      </Tilted>
      <Tilted
        box={inset(41.3, 62.66, 25.75, 11.19)}
        angle={-3.21}
        flipX
        width={[-96.3264, 7.62586]}
        height={[3.67356, 92.3741]}
      >
        <Image src="/portal/batik-filled-4.svg" alt="" fill sizes="30vw" />
      </Tilted>
      <Tilted
        box={inset(43.79, 87.83, 23.26, -13.98)}
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
      <Tilted
        box={inset(33.95, 59.67, 32.8, 23.98)}
        angle={-4.74}
        width={[91.1453, -6.59852]}
        height={[8.85467, 93.4015]}
      >
        <Link
          href="#"
          aria-label="KM ITS Knowledge"
          style={{ display: "block", position: "relative", width: "100%", height: "100%" }}
        >
          <Image src="/portal/card-bg-2.svg" alt="" fill />
        </Link>
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
        box={inset(44.55, 63.77, 49.21, 27.32)}
        angle={-4.76}
        width={[97.3965, -20.5994]}
        height={[2.60346, 79.4006]}
      >
        <p style={centered(12.433, 600)}>KM ITS Knowledge</p>
      </Tilted>
      <Tilted
        box={inset(52.39, 63.96, 42.41, 28.18)}
        angle={-4.51}
        width={[97.6733, -20.6733]}
        height={[2.32673, 79.3267]}
      >
        <p style={centered(10.361, 400)}>Temukan Arsip KM ITS</p>
      </Tilted>

      {/* Card 2: Timeline */}
      <div className="pf-abs" style={inset(33.84, 42.51, 34.99, 42.54)}>
        <Link
          href="#"
          aria-label="Integrated Timeline KM ITS"
          style={{ display: "block", position: "relative", width: "100%", height: "100%" }}
        >
          <Image src="/portal/card-bg-4.svg" alt="" fill />
        </Link>
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
          ...inset(43.02, 45.69, 52.01, 45.6),
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
          ...inset(53.35, 45.04, 42.45, 45.06),
          margin: 0,
          textAlign: "center",
          color: "#fff",
          fontSize: px(10.361),
          lineHeight: "normal",
        }}
      >
        Lihat Agenda Kegiatan Ormawa
      </p>

      {/* Card 3: News */}
      <Tilted
        box={inset(34.23, 23.91, 32.52, 59.74)}
        angle={4.74}
        flipX
        width={[-91.1453, -6.59852]}
        height={[-8.85467, 93.4015]}
      >
        <Link
          href="#"
          aria-label="KM ITS News"
          style={{ display: "block", position: "relative", width: "100%", height: "100%" }}
        >
          <Image src="/portal/card-bg-3.svg" alt="" fill />
        </Link>
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
        box={inset(45.51, 27.32, 50.74, 63.89)}
        angle={4.76}
        width={[98.6871, 34.2563]}
        height={[-1.31292, 65.7437]}
      >
        <p style={centered(12.433, 600)}>KM ITS News</p>
      </Tilted>
      <Tilted
        box={inset(51.24, 28.19, 43.32, 63.03)}
        angle={4.67}
        width={[97.8075, 22.9261]}
        height={[-2.1925, 77.0739]}
      >
        <p style={centered(10.361, 400)}>Baca Berita Terbaru dari BEM ITS</p>
      </Tilted>

      {/* CTA label */}
      <div
        className="pf-button"
        style={rect(380.2, 388.54, 202.044, 30.048)}
        aria-hidden
      />
      <p
        className="pf-abs"
        style={{
          ...inset(73.23, 43.1, 24.09, 43.13),
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
    </Frame>
  );
}
