import React from "react";
import { AdminDashboardLayout } from "@/components/admin/AdminDashboardLayout";
import { AdminPosterList } from "@/components/admin/AdminPosterList";
import { useAdminToken } from "@/context/AdminTokenContext";

export default function AdminPosters() {
  const { adminStoreKey } = useAdminToken();

  return (
    <AdminDashboardLayout
      title="Posters"
      breadcrumb={[
        { label: "Admin", href: "/admin" },
        { label: "Posters" },
      ]}
    >
      <AdminPosterList key={adminStoreKey} />
    </AdminDashboardLayout>
  );
}
