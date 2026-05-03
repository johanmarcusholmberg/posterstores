import React, { useEffect, useState } from "react";
import { Link } from "wouter";
import { AdminDashboardLayout } from "@/components/admin/AdminDashboardLayout";
import { useAdminToken } from "@/context/AdminTokenContext";
import {
  adminListFulfillment,
  AdminOrder,
  FULFILLMENT_STATUSES,
  ORDER_STATUSES,
  FulfillmentStatus,
} from "@/lib/adminApi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ExternalLink, Download } from "lucide-react";
import { cn } from "@/lib/utils";

const FULFILLMENT_COLORS: Record<string, string> = {
  not_started: "bg-gray-100 text-gray-700",
  ready_for_production: "bg-yellow-100 text-yellow-700",
  in_production: "bg-blue-100 text-blue-700",
  shipped: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  pending_payment: "bg-amber-100 text-amber-700",
  paid: "bg-green-100 text-green-700",
  processing: "bg-blue-100 text-blue-700",
  shipped: "bg-indigo-100 text-indigo-700",
  cancelled: "bg-red-100 text-red-700",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function AdminFulfillment() {
  const { token, adminStoreKey } = useAdminToken();
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fulfillmentFilter, setFulfillmentFilter] = useState("all");
  const [orderStatusFilter, setOrderStatusFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);
  const LIMIT = 25;

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError("");
    adminListFulfillment(token, adminStoreKey, {
      fulfillmentStatus: fulfillmentFilter === "all" ? undefined : fulfillmentFilter as FulfillmentStatus,
      orderStatus: orderStatusFilter === "all" ? undefined : orderStatusFilter,
      limit: LIMIT,
      offset: page * LIMIT,
    })
      .then(({ orders: data, total: t }) => {
        setOrders(data);
        setTotal(t);
      })
      .catch((e) => setError(e?.message ?? "Failed to load fulfillment queue"))
      .finally(() => setLoading(false));
  }, [token, adminStoreKey, fulfillmentFilter, orderStatusFilter, page]);

  const handleExport = async () => {
    if (!token) return;
    setExporting(true);
    try {
      const qs = new URLSearchParams();
      if (adminStoreKey) qs.set("storeKey", adminStoreKey);
      if (fulfillmentFilter !== "all") qs.set("fulfillmentStatus", fulfillmentFilter);
      if (orderStatusFilter !== "all") qs.set("orderStatus", orderStatusFilter);

      const res = await fetch(`/api/admin/fulfillment/export.csv?${qs}`, {
        headers: { "X-Admin-Token": token },
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "fulfillment-export.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e?.message ?? "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <AdminDashboardLayout
      title="Fulfillment Queue"
      breadcrumb={[
        { label: "Admin", href: "/admin" },
        { label: "Fulfillment" },
      ]}
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={fulfillmentFilter}
            onValueChange={(v) => { setFulfillmentFilter(v); setPage(0); }}
          >
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Fulfillment status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All fulfillment statuses</SelectItem>
              {FULFILLMENT_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={orderStatusFilter}
            onValueChange={(v) => { setOrderStatusFilter(v); setPage(0); }}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Order status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All order statuses</SelectItem>
              {ORDER_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <span className="text-sm text-muted-foreground flex-1">
            {total} order{total !== 1 ? "s" : ""}
          </span>

          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleExport}
            disabled={exporting}
          >
            <Download className="w-3.5 h-3.5" />
            {exporting ? "Exporting..." : "Export CSV"}
          </Button>
        </div>

        <div className="rounded-md border bg-background overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Order</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Customer</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Order Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Fulfillment</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Total</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Date</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Ship to</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Items</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={9} className="px-4 py-3">
                        <Skeleton className="h-5 w-full" />
                      </td>
                    </tr>
                  ))
                : orders.length === 0
                ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                        No orders in fulfillment queue
                      </td>
                    </tr>
                  )
                : orders.map((order) => (
                    <tr key={order.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-mono font-medium whitespace-nowrap">#{order.id}</td>
                      <td className="px-4 py-3 max-w-[160px] truncate" title={order.customerEmail}>
                        {order.customerEmail}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap", STATUS_COLORS[order.status] ?? "bg-gray-100 text-gray-700")}>
                          {ORDER_STATUSES.find(s => s.value === order.status)?.label ?? order.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap", FULFILLMENT_COLORS[order.fulfillmentStatus ?? "not_started"] ?? "bg-gray-100 text-gray-700")}>
                          {FULFILLMENT_STATUSES.find(s => s.value === order.fulfillmentStatus)?.label ?? "Not Started"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium whitespace-nowrap">
                        {order.total} {order.currency}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDate(order.createdAt)}</td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {order.shippingCity}, {order.shippingCountry}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{order.items.length}</td>
                      <td className="px-4 py-3">
                        <Link href={`/admin/orders/${order.id}`}>
                          <Button variant="ghost" size="sm" className="gap-1 whitespace-nowrap">
                            Process <ExternalLink className="w-3 h-3" />
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>

        {total > LIMIT && (
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page + 1} of {Math.ceil(total / LIMIT)}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={(page + 1) * LIMIT >= total}
              onClick={() => setPage(p => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </AdminDashboardLayout>
  );
}
