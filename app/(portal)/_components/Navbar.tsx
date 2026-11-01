import Image from "next/image";
import Link from "next/link";
import { inset, px } from "./geometry";

const NAV_W = 932.51;
const NAV_H = 38.337;

const links = [
  { label: "Knowledge", href: "#", box: inset(32.43, 23.44, 29.73, 70.44) },
  { label: "Timeline", href: "#", box: inset(32.43, 17.22, 29.73, 78.11) },
  { label: "News", href: "#", box: inset(32.43, 12.67, 29.73, 84.33) },
];

export default function Navbar() {
  return (
    <div className="nb-bar">
      <div className="nb-canvas">
        <header
          className="nb-nav"
          style={{
            left: `${(15.54 / 963.3637) * 100}%`,
            top: `${(16.58 / 60) * 100}%`,
            width: `${(NAV_W / 963.3637) * 100}%`,
            height: `${(NAV_H / 60) * 100}%`,
          }}
        >
          <Link href="/" className="nb-logo" style={inset(24.32, 94.56, 24.32, 1.78)}>
            <Image src="/portal/logo-its.png" alt="ITS" fill sizes="5vw" />
          </Link>
          <Link
            href="/"
            className="nb-brand"
            style={{ ...inset(32.43, 84.56, 29.73, 6.33), fontSize: px(12.43) }}
          >
            Portal KM ITS
          </Link>

          <nav aria-label="Utama">
            {links.map((l) => (
              <Link
                key={l.label}
                href={l.href}
                className="nb-link"
                style={{ ...l.box, fontSize: px(10.36) }}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <Link
            href="#"
            className="nb-login"
            style={inset(21.62, 2, 21.61, 89.33)}
          >
            <span className="nb-loginIcon">
              <Image src="/portal/icon-user.svg" alt="" fill />
            </span>
            <span className="nb-loginText" style={{ fontSize: px(8.16) }}>
              Masuk
            </span>
          </Link>
        </header>
      </div>
    </div>
  );
}
