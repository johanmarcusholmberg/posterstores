import React, { useEffect, useState } from "react";
import { Link } from "wouter";
import { AdminDashboardLayout } from "@/components/admin/AdminDashboardLayout";
import { useAdminToken } from "@/context/AdminTokenContext";
import { adminGetStats } from "@/lib/adminApi";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Images,
  ShoppingBag,
  LayoutTemplate,
  Tag,
  Mail,
  TrendingUp,
  Star,
  Sparkles,
  ArrowRight,
  ClipboardList,
  Package,
  Globe,
  Rocket,
  Settings2,
  FileText,
} from "lucide-react";

export default function AdminDashboard() {
  const { adminStoreKey } = useAdminToken();
  const [stats, setStats] = useState<{
    totalPosters: number;
    totalOrders: number;
    topCategories: { category: string; count: number }[];
    featuredCount: number;
    newArrivalsCount: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    adminGetStats(adminStoreKey)
      .then(setStats)
      .catch(e => setError(e?.message ?? "Failed to load stats"))
      .finally(() => setLoading(false));
  }, [adminStoreKey]);

  const statCards = [
    {
      label: "Total Posters",
      value: stats?.totalPosters,
      icon: Images,
      href: "/admin/posters",
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "Featured",
      value: stats?.featuredCount,
      icon: Star,
      href: "/admin/posters",
      color: "text-yellow-600",
      bg: "bg-yellow-50",
    },
    {
      label: "New Arrivals",
      value: stats?.newArrivalsCount,
      icon: Sparkles,
      href: "/admin/posters",
      color: "text-indigo-600",
      bg: "bg-indigo-50",
    },
    {
      label: "Total Orders",
      value: stats?.totalOrders,
      icon: ShoppingBag,
      href: "/admin/orders",
      color: "text-green-600",
      bg: "bg-green-50",
    },
  ];

  const placeholderCards = [
    { label: "Taxonomy", icon: Tag, description: "Manage categories, regions, cities and tags." },
    { label: "Newsletter", icon: Mail, description: "View subscribers and send campaign emails." },
  ];

  return (
    <AdminDashboardLayout
      title="Dashboard"
      breadcrumb={[{ label: "Admin" }, { label: "Dashboard" }]}
    >
      <div className="space-y-8">
        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Store overview
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {statCards.map(card => {
              const Icon = card.icon;
              return (
                <Link key={card.label} href={card.href}>
                  <Card className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="p-4 flex items-start gap-3">
                      <div className={`rounded-lg p-2 ${card.bg}`}>
                        <Icon className={`w-5 h-5 ${card.color}`} />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">{card.label}</p>
                        {loading ? (
                          <Skeleton className="h-7 w-10 mt-0.5" />
                        ) : (
                          <p className="text-2xl font-bold">{card.value ?? "—"}</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>

        {stats && stats.topCategories.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Top categories
            </h2>
            <Card>
              <CardContent className="p-4">
                <div className="space-y-2">
                  {stats.topCategories.map(cat => (
                    <div key={cat.category} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{cat.category}</span>
                      <span className="font-semibold">{cat.count}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Quick actions
          </h2>
          <div className="flex flex-wrap gap-3">
            <Link href="/admin/posters/new">
              <div className="flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium bg-background hover:bg-muted transition-colors cursor-pointer">
                <Images className="w-4 h-4 text-primary" />
                Add new poster
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
            </Link>
            <Link href="/admin/posters">
              <div className="flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium bg-background hover:bg-muted transition-colors cursor-pointer">
                <TrendingUp className="w-4 h-4 text-primary" />
                View all posters
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
            </Link>
            <Link href="/admin/orders">
              <div className="flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium bg-background hover:bg-muted transition-colors cursor-pointer">
                <ClipboardList className="w-4 h-4 text-primary" />
                View orders
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
            </Link>
            <Link href="/admin/fulfillment">
              <div className="flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium bg-background hover:bg-muted transition-colors cursor-pointer">
                <Package className="w-4 h-4 text-primary" />
                Fulfillment queue
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
            </Link>
            <Link href="/admin/mockups">
              <div className="flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium bg-background hover:bg-muted transition-colors cursor-pointer">
                <LayoutTemplate className="w-4 h-4 text-primary" />
                Manage mockups
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
            </Link>
            <Link href="/admin/stores">
              <div className="flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium bg-background hover:bg-muted transition-colors cursor-pointer">
                <Globe className="w-4 h-4 text-primary" />
                Manage stores
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
            </Link>
            <Link href="/admin/launch-checklist">
              <div className="flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium bg-background hover:bg-muted transition-colors cursor-pointer">
                <Rocket className="w-4 h-4 text-primary" />
                Launch checklist
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
            </Link>
            <Link href="/admin/content">
              <div className="flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium bg-background hover:bg-muted transition-colors cursor-pointer">
                <FileText className="w-4 h-4 text-primary" />
                Edit content pages
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
            </Link>
            <Link href="/admin/production-setup">
              <div className="flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium bg-background hover:bg-muted transition-colors cursor-pointer">
                <Settings2 className="w-4 h-4 text-primary" />
                Production setup
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
            </Link>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Coming soon
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {placeholderCards.map(card => {
              const Icon = card.icon;
              return (
                <Card key={card.label} className="border-dashed opacity-60">
                  <CardContent className="p-4 flex items-start gap-3">
                    <div className="rounded-lg p-2 bg-muted">
                      <Icon className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{card.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{card.description}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </AdminDashboardLayout>
  );
}
