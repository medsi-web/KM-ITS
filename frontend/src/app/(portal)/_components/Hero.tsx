import Image from "next/image";
import Link from "next/link";
import Frame from "./Frame";
import { inset, px, rect } from "./geometry";

/** Batik key-graphic tiles on the right panel, in Figma % insets (top right bottom left). */
const batik = [
  inset(-7.07, -2.93, 69.25, 77.76),
  inset(-7.07, 22.13, 69.25, 52.7),
  inset(30.59, 22.13, 31.59, 52.71),
  inset(30.59, -2.93, 31.59, 77.76),
  inset(68.26, 22.13, -6.08, 52.7),
  inset(68.26, -2.93, -6.08, 77.76),
];

export default function Hero() {
  return (
    <Frame id="beranda" label="Beranda">
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
          top: `${(167.9 / 541.8921) * 100}%`,
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
          top: `${(291.2 / 541.8921) * 100}%`,
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
        href="#fitur"
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
          style={rect(216.18 - 117.05, 342.6 - 329.47, 3.689, 5.913, 112.937, 30.048)}
        >
          <Image src="/portal/icon-chevron.svg" alt="" fill />
        </span>
      </Link>
    </Frame>
  );
}
