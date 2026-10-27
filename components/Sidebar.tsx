"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Today" },
  { href: "/research", label: "Supplier research" },
  { href: "/report", label: "End-of-day report" },
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <nav className="sidebar" aria-label="Main">
      <div className="brand">
        <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
          <rect
            x="3"
            y="7"
            width="22"
            height="16"
            rx="2"
            fill="none"
            stroke="#E8B27A"
            strokeWidth="2"
          />
          <path
            d="M3 12h22M11 7v5M17 7v5"
            stroke="#E8B27A"
            strokeWidth="2"
            fill="none"
          />
        </svg>
        <div>
          <div className="brand-title">Day Tracker</div>
          <div className="brand-sub">Arka · Ops intern</div>
        </div>
      </div>

      {links.map((l) => {
        const active =
          l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`navlink${active ? " active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            {l.label}
          </Link>
        );
      })}

      <div className="sidebar-foot">Reports to Allan · Slack #ops-interns</div>
    </nav>
  );
}
