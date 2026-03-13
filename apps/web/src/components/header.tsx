import { Link } from "@tanstack/react-router";

export default function Header() {
  const links = [{ to: "/", label: "Studio" }] as const;

  return (
    <div className="border-b border-border/60 bg-background/90 backdrop-blur">
      <div className="flex flex-row items-center justify-between px-3 py-2">
        <nav className="flex items-center gap-4 text-sm uppercase tracking-[0.22em] text-muted-foreground">
          {links.map(({ to, label }) => {
            return (
              <Link key={to} to={to} className="text-foreground">
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Local-first Blyp inspection
        </div>
      </div>
    </div>
  );
}
