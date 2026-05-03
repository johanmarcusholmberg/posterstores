import React from "react";
import { AdminDashboardLayout } from "@/components/admin/AdminDashboardLayout";
import { AdminStoreForm } from "@/components/admin/AdminStoreForm";

export default function AdminStoreNew() {
  return (
    <AdminDashboardLayout
      title="New store"
      breadcrumb={[
        { label: "Admin", href: "/admin" },
        { label: "Stores", href: "/admin/stores" },
        { label: "New" },
      ]}
    >
      <AdminStoreForm />
    </AdminDashboardLayout>
  );
}
