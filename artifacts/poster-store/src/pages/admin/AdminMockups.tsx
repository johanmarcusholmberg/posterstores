import React from "react";
import { AdminDashboardLayout } from "@/components/admin/AdminDashboardLayout";
import { AdminMockupTemplateList } from "@/components/admin/AdminMockupTemplateList";
import { useAdminToken } from "@/context/AdminTokenContext";
import { Info } from "lucide-react";

export default function AdminMockups() {
  const { adminStoreKey } = useAdminToken();

  return (
    <AdminDashboardLayout
      title="Mockup templates"
      breadcrumb={[
        { label: "Admin", href: "/admin" },
        { label: "Mockup templates" },
      ]}
    >
      <div className="space-y-6" data-testid="admin-mockups-page">
        <div className="rounded-md bg-muted/60 border px-4 py-3 flex gap-3 text-sm text-muted-foreground">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-foreground mb-0.5">About mockup templates</p>
            <p>
              Templates can be <strong>global</strong> (available to all stores) or{" "}
              <strong>store-specific</strong> (only for a selected store). When assigning
              mockups to a poster, both global templates and templates for the active store
              are available. Mockup images are presentation-only assets — they do not
              replace the master printable poster image.
            </p>
          </div>
        </div>

        <AdminMockupTemplateList storeKey={adminStoreKey} />
      </div>
    </AdminDashboardLayout>
  );
}
