import { CalendarRange, Coins, Crown, LayoutDashboard, Megaphone, Shield, Table2, UserRound, Users } from "lucide-react";

/** Adminsidorna – används både i adminens sidomeny och i hamburgermenyn (bara för admin). */
export const ADMIN_LINKS = [
  { href: "/admin", label: "Översikt", icon: LayoutDashboard },
  { href: "/admin/tavlingar", label: "Tävlingar", icon: CalendarRange },
  { href: "/admin/deltagare", label: "Deltagare", icon: Users },
  { href: "/admin/tabell", label: "Tabell", icon: Table2 },
  { href: "/admin/lag", label: "Lag", icon: Shield },
  { href: "/admin/spelare", label: "Spelare & mål", icon: UserRound },
  { href: "/admin/utskick", label: "Utskick", icon: Megaphone },
  { href: "/admin/odds", label: "Odds", icon: Coins },
  { href: "/admin/heroes", label: "Heroes & historik", icon: Crown },
];
