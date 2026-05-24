import React from "react";
import { Link, useLocation } from "wouter";
import { useAdminToken } from "@/context/AdminTokenContext";
import { AdminStoreSelector } from "./AdminStoreSelector";
import { AdminTokenGate } from "./AdminTokenGate";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Images,
  ShoppingBag,
  Tag,
  Mail,
  LayoutTemplate,
  LogOut,
  ChevronRight,
  Package,
  Globe,
  Rocket,
  Settings2,
  FileText,
  LayoutPanelTop,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/posters", label: "Posters", icon: Images },
  { href: "/admin/orders", label: "Orders", icon: ShoppingBag },
  { href: "/admin/fulfillment", label: "Fulfillment", icon: Package },
  { href: "/admin/mockups", label: "Mockups", icon: LayoutTemplate },
  { href: "/admin/homepage", label: "Homepage Editor", icon: LayoutPanelTop },
  { href: "/admin/content", label: "Content Pages", icon: FileText },
  { href: "/admin/stores", label: "Stores", icon: Globe },
  { href: "/admin/launch-checklist", label: "Launch Checklist", icon: Rocket },
  { href: "/admin/production-setup", label: "Production Setup", icon: Settings2 },
  { href: "/admin/taxonomy", label: "Taxonomy", icon: Tag, disabled: true },
  { href: "/admin/newsletter", label: "Newsletter", icon: Mail, disabled: true },
];

interface AdminDashboardLayoutProps {
  children: React.ReactNode;
  title?: string;
  breadcrumb?: { label: string; href?: string }[];
}

export const AdminDashboardLayout = ({ children, title, breadcrumb }: AdminDashboardLayoutProps) => {
  const { logout } = useAdminToken();
  const [location] = useLocation();

  return (
    <AdminTokenGate>
      <div className="min-h-screen bg-muted/20 flex flex-col">
        <header className="sticky top-0 z-40 bg-background border-b shadow-sm">
          <div className="flex h-14 items-center px-4 gap-4">
            <Link href="/admin" className="flex items-center gap-2 font-semibold text-primary mr-2">
              <LayoutDashboard className="w-5 h-5" />
              <span className="hidden sm:inline">Admin</span>
            </Link>
            <Separator orientation="vertical" className="h-6" />
            <AdminStoreSelector />
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={logout}
                className="text-muted-foreground text-xs gap-1"
                data-testid="admin-logout"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Log out</span>
              </Button>
            </div>
          </div>
        </header>

        <div className="flex flex-1">
          <aside className="hidden md:flex w-52 shrink-0 flex-col border-r bg-background py-4">
            <nav className="flex flex-col gap-0.5 px-2">
              {NAV_ITEMS.map(item => {
                const isActive = item.exact
                  ? location === item.href
                  : location.startsWith(item.href) && item.href !== "/admin";
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.disabled ? "#" : item.href}>
                    <span
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : item.disabled
                          ? "text-muted-foreground/40 cursor-not-allowed"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      {item.label}
                      {item.disabled && (
                        <span className="ml-auto text-[10px] bg-muted rounded px-1">soon</span>
                      )}
                    </span>
                  </Link>
                );
              })}
            </nav>
          </aside>

          <main className="flex-1 p-4 md:p-6 overflow-auto">
            {(title || breadcrumb) && (
              <div className="mb-6">
                {breadcrumb && breadcrumb.length > 0 && (
                  <nav className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                    {breadcrumb.map((crumb, i) => (
                      <React.Fragment key={i}>
                        {i > 0 && <ChevronRight className="w-3 h-3" />}
                        {crumb.href ? (
                          <Link href={crumb.href} className="hover:text-foreground transition-colors">{crumb.label}</Link>
                        ) : (
                          <span className="text-foreground">{crumb.label}</span>
                        )}
                      </React.Fragment>
                    ))}
                  </nav>
                )}
                {title && <h1 className="text-2xl font-bold tracking-tight">{title}</h1>}
              </div>
            )}
            {children}
          </main>
        </div>
      </div>
    </AdminTokenGate>
  );
};
