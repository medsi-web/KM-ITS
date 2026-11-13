import Image from "next/image";
import Link from "next/link";
import { Layer } from "./Canvas";
import { HERO_H, inset, px, rect as rectOf, rectIn } from "@/app/_components/geometry";

const rect = rectIn(HERO_H);

/** Batik key-graphic tiles on the right panel, in Figma % insets (top right bottom left). */
const batik = [
  inset(-7.67, -2.97, 66.68, 77.79),
  inset(-7.67, 22.1, 66.68, 52.72),
  inset(33.16, 22.1, 25.86, 52.73),
  inset(33.16, -2.97, 25.86, 77.79),
  inset(73.98, 22.1, -14.97, 52.72),
  inset(73.98, -2.97, -14.97, 77.79),
];

export default function Hero() {
  return (
    <Layer top={0} height={HERO_H}>
      {/* Building illustration */}
      <div className="pf-abs" style={rect(-274.59, 81.93, 746, 417)}>
        <Image
          src="/portal/building-sketch.png"
          alt=""
          fill
          priority
          sizes="80vw"
          style={{ objectFit: "cover" }}
        />
      </div>
      <div
        className="pf-abs"
        style={{ ...rect(72.41, 191.93, 454, 352), overflow: "hidden" }}
      >
        <div
          className="pf-abs"
          style={{ left: "-0.02%", top: 0, width: "138.8%", height: "100%" }}
        >
          <Image
            src="/portal/building-roof.png"
            alt=""
            fill
            priority
            sizes="80vw"
          />
        </div>
      </div>
      <div
        className="pf-abs"
        style={{
          ...rect(0.41, -21.07, 526, 512),
          backgroundImage:
            "linear-gradient(180.476662479997deg, rgb(255, 255, 255) 14.516%, rgba(255, 255, 255, 0) 112.56%)",
        }}
      />
      <div
        className="pf-abs"
        style={{
          ...rect(0.41, 293.93, 526, 205),
          backgroundImage:
            "linear-gradient(to bottom, rgba(255, 255, 255, 0), rgba(89, 163, 210, 0.6))",
        }}
      />

      {/* Batik panel + emblem */}
      {batik.map((box, i) => (
        <div key={i} className="pf-abs" style={box}>
          <Image
            src={`/portal/batik-outline-${i + 1}.svg`}
            alt=""
            fill
            sizes="25vw"
          />
        </div>
      ))}
      <div
        className="pf-abs"
        style={{
          ...rect(653.79, 175.1, 191.683, 191.683),
          background: "#fff",
          borderRadius: "50%",
        }}
      />
      <div className="pf-abs" style={rect(669.33, 190.65, 160.599, 160.599)}>
        <Image src="/portal/emblem-its.svg" alt="Lambang ITS" fill />
      </div>

      {/* Fades the hero into the white page below */}
      <div
        className="pf-abs"
        style={{
          ...rect(0, 410, 963.3637, 91),
          backgroundImage:
            "linear-gradient(to bottom, rgba(255, 255, 255, 0), #fff)",
        }}
      />

      {/* Copy */}
      <p
        className="pf-abs"
        style={{
          ...rect(118.1, 153.4, 112.9, 14.5),
          fontSize: px(12.433),
          fontWeight: 600,
          color: "var(--color-navy)",
          whiteSpace: "nowrap",
        }}
      >
        Selamat Datang di
      </p>
      <h1
        className="pf-heading"
        style={{
          left: `${(118.1 / 963.3637) * 100}%`,
          top: `${(167.9 / HERO_H) * 100}%`,
          fontSize: px(33.156),
          color: "#000",
          whiteSpace: "nowrap",
        }}
      >
        Portal
        <br />
        Keluarga Mahasiswa
        <br />
        ITS
      </h1>
      <p
        className="pf-abs"
        style={{
          left: `${(118.1 / 963.3637) * 100}%`,
          top: `${(291.2 / HERO_H) * 100}%`,
          fontSize: px(12.433),
          color: "var(--color-ink)",
          whiteSpace: "nowrap",
        }}
      >
        Arsip, agenda, dan berita KM ITS terintegrasi
        <br />
        dalam 1 platform
      </p>

      <Link
        href="#features"
        className="pf-button"
        style={{
          ...rect(117.05, 329.47, 112.937, 30.048),
          justifyContent: "flex-start",
          paddingLeft: px(9.35),
          fontSize: px(12.433),
        }}
      >
        Mulai Telusuri
        <span
          className="pf-abs"
          style={rectOf(
            216.18 - 117.05,
            342.6 - 329.47,
            3.689,
            5.913,
            112.937,
            30.048,
          )}
        >
          <Image src="/portal/icon-chevron.svg" alt="" fill />
        </span>
      </Link>
    </Layer>
  );
}
