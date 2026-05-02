import React from "react";
import { AdminDashboardLayout } from "@/components/admin/AdminDashboardLayout";
import { AdminPosterForm } from "@/components/admin/AdminPosterForm";

export default function AdminPosterNew() {
  return (
    <AdminDashboardLayout
      title="New Poster"
      breadcrumb={[
        { label: "Admin", href: "/admin" },
        { label: "Posters", href: "/admin/posters" },
        { label: "New" },
      ]}
    >
      <AdminPosterForm />
    </AdminDashboardLayout>
  );
}
