import React, { useState } from "react";
import { AdminDashboardLayout } from "@/components/admin/AdminDashboardLayout";
import { AdminMockupTemplateList } from "@/components/admin/AdminMockupTemplateList";
import { AdminMockupSyncPanel } from "@/components/admin/AdminMockupSyncPanel";
import { useAdminToken } from "@/context/AdminTokenContext";
import { LayoutTemplate, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "templates" | "sync";

export default function AdminMockups() {
  const { adminStoreKey } = useAdminToken();
  const [tab, setTab] = useState<Tab>("templates");

  return (
    <AdminDashboardLayout
      title="Mockups"
      breadcrumb={[
        { label: "Admin", href: "/admin" },
        { label: "Mockups" },
      ]}
    >
      <div className="space-y-6" data-testid="admin-mockups-page">
        {/* Tab bar */}
        <div className="flex gap-1 border-b">
          <TabButton
            active={tab === "templates"}
            onClick={() => setTab("templates")}
            icon={<LayoutTemplate className="w-4 h-4" />}
            label="Templates"
          />
          <TabButton
            active={tab === "sync"}
            onClick={() => setTab("sync")}
            icon={<RefreshCw className="w-4 h-4" />}
            label="Sync mockups"
          />
        </div>

        {tab === "templates" && (
          <AdminMockupTemplateList storeKey={adminStoreKey} />
        )}

        {tab === "sync" && (
          <AdminMockupSyncPanel storeKey={adminStoreKey} />
        )}
      </div>
    </AdminDashboardLayout>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
      )}
    >
      {icon}
      {label}
    </button>
  );
}
