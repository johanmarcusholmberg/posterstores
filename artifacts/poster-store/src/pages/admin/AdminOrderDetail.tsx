import React, { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { AdminDashboardLayout } from "@/components/admin/AdminDashboardLayout";
import { useAdminToken } from "@/context/AdminTokenContext";
import {
  adminGetOrder,
  adminUpdateOrderStatus,
  adminUpdateFulfillment,
  AdminOrder,
  AdminOrderItem,
  ORDER_STATUSES,
  FULFILLMENT_STATUSES,
  FulfillmentStatus,
} from "@/lib/adminApi";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ExternalLink, ArrowLeft, CheckCircle2, XCircle, Mail, Copy, AlertTriangle, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  pending_payment: "bg-amber-100 text-amber-700",
  paid: "bg-green-100 text-green-700",
  processing: "bg-blue-100 text-blue-700",
  shipped: "bg-indigo-100 text-indigo-700",
  cancelled: "bg-red-100 text-red-700",
};

const FULFILLMENT_COLORS: Record<string, string> = {
  not_started: "bg-gray-100 text-gray-700",
  ready_for_production: "bg-yellow-100 text-yellow-700",
  in_production: "bg-blue-100 text-blue-700",
  shipped: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  unpaid: "bg-gray-100 text-gray-700",
  pending: "bg-amber-100 text-amber-700",
  paid: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-orange-100 text-orange-700",
  refunded: "bg-purple-100 text-purple-700",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MonoField({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-xs break-all bg-muted/50 px-2 py-1 rounded">{value}</span>
    </div>
  );
}

function getPrintFileUrl(item: AdminOrderItem): string | null {
  return item.masterPrintImageUrlSnapshot ?? null;
}

function PrintFileSection({ item }: { item: AdminOrderItem }) {
  const { toast } = useToast();
  const printUrl = getPrintFileUrl(item);
  const hasMasterSnapshot = !!item.masterPrintImageUrlSnapshot;

  const copyToClipboard = (url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      toast({ title: "Copied to clipboard" });
    });
  };

  return (
    <div className="mt-3 border-t pt-3 space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Print File</p>

      {!hasMasterSnapshot && (
        <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>No dedicated master print file snapshot exists for this order.</span>
        </div>
      )}

      {printUrl ? (
        <div className="flex flex-wrap gap-2">
          <a href={printUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="default" size="sm" className="gap-1 text-xs h-7">
              Open Master Print File <ExternalLink className="w-3 h-3" />
            </Button>
          </a>
          <Button
            variant="outline"
            size="sm"
            className="gap-1 text-xs h-7"
            onClick={() => copyToClipboard(printUrl)}
          >
            <Copy className="w-3 h-3" /> Copy URL
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">No print file available for this item.</p>
      )}

      {item.previewImageUrlSnapshot && (
        <a href={item.previewImageUrlSnapshot} target="_blank" rel="noopener noreferrer">
          <Button variant="outline" size="sm" className="gap-1 text-xs h-7">
            Open Preview Image <ExternalLink className="w-3 h-3" />
          </Button>
        </a>
      )}
    </div>
  );
}

export default function AdminOrderDetail() {
  const { id } = useParams();
  const orderId = Number(id);
  const { token } = useAdminToken();
  const { toast } = useToast();

  const [order, setOrder] = useState<AdminOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState("");

  const [fulfillmentUpdating, setFulfillmentUpdating] = useState(false);
  const [selectedFulfillmentStatus, setSelectedFulfillmentStatus] = useState<FulfillmentStatus | "">("");
  const [fulfillmentNotes, setFulfillmentNotes] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");

  useEffect(() => {
    if (!token || !orderId) return;
    setLoading(true);
    adminGetOrder(token, orderId)
      .then((o) => {
        setOrder(o);
        setSelectedStatus(o.status);
        setSelectedFulfillmentStatus((o.fulfillmentStatus as FulfillmentStatus) ?? "not_started");
        setFulfillmentNotes(o.fulfillmentNotes ?? "");
        setTrackingNumber(o.trackingNumber ?? "");
        setTrackingUrl(o.trackingUrl ?? "");
      })
      .catch((e) => setError(e?.message ?? "Failed to load order"))
      .finally(() => setLoading(false));
  }, [token, orderId]);

  const handleStatusUpdate = async () => {
    if (!token || !order || selectedStatus === order.status) return;
    setStatusUpdating(true);
    try {
      const updated = await adminUpdateOrderStatus(token, order.id, selectedStatus);
      setOrder(updated);
      setSelectedStatus(updated.status);
      toast({ title: "Status updated" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Failed to update status", description: e?.message });
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleFulfillmentSave = async () => {
    if (!token || !order) return;
    setFulfillmentUpdating(true);
    try {
      const updated = await adminUpdateFulfillment(token, order.id, {
        fulfillmentStatus: selectedFulfillmentStatus as FulfillmentStatus || undefined,
        fulfillmentNotes: fulfillmentNotes || null,
        trackingNumber: trackingNumber || null,
        trackingUrl: trackingUrl || null,
      });
      setOrder(updated);
      toast({ title: "Fulfillment saved" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Failed to save fulfillment", description: e?.message });
    } finally {
      setFulfillmentUpdating(false);
    }
  };

  const handleMarkReadyForProduction = async () => {
    if (!token || !order) return;
    setFulfillmentUpdating(true);
    try {
      const updated = await adminUpdateFulfillment(token, order.id, {
        fulfillmentStatus: "ready_for_production",
      });
      setOrder(updated);
      setSelectedFulfillmentStatus("ready_for_production");
      toast({ title: "Marked ready for production" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Failed", description: e?.message });
    } finally {
      setFulfillmentUpdating(false);
    }
  };

  const handleMarkInProduction = async () => {
    if (!token || !order) return;
    setFulfillmentUpdating(true);
    try {
      const updated = await adminUpdateFulfillment(token, order.id, {
        markInProduction: true,
      });
      setOrder(updated);
      setSelectedFulfillmentStatus("in_production");
      toast({ title: "Marked in production" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Failed", description: e?.message });
    } finally {
      setFulfillmentUpdating(false);
    }
  };

  const handleMarkShipped = async () => {
    if (!token || !order) return;
    setFulfillmentUpdating(true);
    try {
      const updated = await adminUpdateFulfillment(token, order.id, {
        markShipped: true,
        trackingNumber: trackingNumber || null,
        trackingUrl: trackingUrl || null,
      });
      setOrder(updated);
      setSelectedStatus(updated.status);
      setSelectedFulfillmentStatus("shipped");
      toast({ title: "Order marked as shipped" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Failed to mark shipped", description: e?.message });
    } finally {
      setFulfillmentUpdating(false);
    }
  };

  const handleMarkCancelled = async () => {
    if (!token || !order) return;
    setFulfillmentUpdating(true);
    try {
      const updated = await adminUpdateFulfillment(token, order.id, {
        fulfillmentStatus: "cancelled",
      });
      setOrder(updated);
      setSelectedFulfillmentStatus("cancelled");
      toast({ title: "Fulfillment cancelled" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Failed", description: e?.message });
    } finally {
      setFulfillmentUpdating(false);
    }
  };

  if (loading) {
    return (
      <AdminDashboardLayout title="Order Detail" breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Orders", href: "/admin/orders" }, { label: "Loading..." }]}>
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      </AdminDashboardLayout>
    );
  }

  if (error || !order) {
    return (
      <AdminDashboardLayout title="Order Not Found" breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Orders", href: "/admin/orders" }, { label: "Error" }]}>
        <div className="rounded-md bg-destructive/10 border border-destructive/20 p-4 text-destructive">{error || "Order not found"}</div>
      </AdminDashboardLayout>
    );
  }

  const hasStripeData = order.stripeCheckoutSessionId || order.stripePaymentIntentId || order.paymentStatus || order.paidAt;

  return (
    <AdminDashboardLayout
      title={`Order #${order.id}`}
      breadcrumb={[
        { label: "Admin", href: "/admin" },
        { label: "Orders", href: "/admin/orders" },
        { label: `#${order.id}` },
      ]}
    >
      <div className="space-y-6 max-w-4xl">
        <Link href="/admin/orders">
          <Button variant="ghost" size="sm" className="gap-1.5 -ml-2">
            <ArrowLeft className="w-4 h-4" /> Back to Orders
          </Button>
        </Link>

        {/* Status + Meta */}
        <div className="rounded-lg border bg-background p-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Store:</span>
              <span className="text-sm font-medium">{order.storeKey}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Order Status:</span>
              <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", STATUS_COLORS[order.status] ?? "bg-gray-100 text-gray-700")}>
                {ORDER_STATUSES.find(s => s.value === order.status)?.label ?? order.status}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Fulfillment:</span>
              <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", FULFILLMENT_COLORS[order.fulfillmentStatus ?? "not_started"] ?? "bg-gray-100 text-gray-700")}>
                {FULFILLMENT_STATUSES.find(s => s.value === order.fulfillmentStatus)?.label ?? "Not Started"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Created:</span>
              <span className="text-sm">{formatDate(order.createdAt)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Updated:</span>
              <span className="text-sm">{formatDate(order.updatedAt)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORDER_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={handleStatusUpdate}
              disabled={statusUpdating || selectedStatus === order.status}
              size="sm"
            >
              {statusUpdating ? "Saving..." : "Update"}
            </Button>
          </div>
        </div>

        {/* Fulfillment Panel */}
        <div className="rounded-lg border bg-background p-5">
          <h3 className="font-semibold mb-4 text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Package className="w-4 h-4" /> Fulfillment
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Fulfillment Status</p>
              <Select
                value={selectedFulfillmentStatus}
                onValueChange={(v) => setSelectedFulfillmentStatus(v as FulfillmentStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FULFILLMENT_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              {order.productionStartedAt && (
                <div>
                  <p className="text-xs text-muted-foreground">Production started</p>
                  <p className="text-sm font-medium">{formatDate(order.productionStartedAt)}</p>
                </div>
              )}
              {order.shippedAt && (
                <div>
                  <p className="text-xs text-muted-foreground">Shipped at</p>
                  <p className="text-sm font-medium text-green-700">{formatDate(order.shippedAt)}</p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3 mb-4">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">Tracking Number</label>
              <Input
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder="e.g. 1Z999AA10123456784"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">Tracking URL</label>
              <Input
                value={trackingUrl}
                onChange={(e) => setTrackingUrl(e.target.value)}
                placeholder="https://track.example.com/..."
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">Fulfillment Notes</label>
              <Textarea
                value={fulfillmentNotes}
                onChange={(e) => setFulfillmentNotes(e.target.value)}
                placeholder="Internal notes for production/shipping..."
                rows={3}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleMarkReadyForProduction}
              disabled={fulfillmentUpdating || order.fulfillmentStatus === "ready_for_production"}
            >
              Mark Ready for Production
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleMarkInProduction}
              disabled={fulfillmentUpdating || order.fulfillmentStatus === "in_production"}
            >
              Mark In Production
            </Button>
            <Button
              size="sm"
              variant="default"
              onClick={handleMarkShipped}
              disabled={fulfillmentUpdating || order.fulfillmentStatus === "shipped"}
            >
              Mark Shipped
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={handleMarkCancelled}
              disabled={fulfillmentUpdating || order.fulfillmentStatus === "cancelled"}
            >
              Cancel Fulfillment
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleFulfillmentSave}
              disabled={fulfillmentUpdating}
            >
              {fulfillmentUpdating ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>

        {/* Payment Info */}
        {hasStripeData && (
          <div className="rounded-lg border bg-background p-5">
            <h3 className="font-semibold mb-4 text-sm text-muted-foreground uppercase tracking-wide">Payment Information</h3>
            <div className="space-y-3">
              {order.paymentStatus && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Payment Status:</span>
                  <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", PAYMENT_STATUS_COLORS[order.paymentStatus] ?? "bg-gray-100 text-gray-700")}>
                    {order.paymentStatus}
                  </span>
                </div>
              )}
              {order.paidAt && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Paid At:</span>
                  <span className="text-sm font-medium text-green-700">{formatDate(order.paidAt)}</span>
                </div>
              )}
              {order.cancelledAt && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Cancelled At:</span>
                  <span className="text-sm">{formatDate(order.cancelledAt)}</span>
                </div>
              )}
              <div className="space-y-2 mt-3">
                <MonoField label="Stripe Checkout Session ID" value={order.stripeCheckoutSessionId} />
                <MonoField label="Stripe Payment Intent ID" value={order.stripePaymentIntentId} />
              </div>
            </div>
          </div>
        )}

        {!hasStripeData && order.status === "pending_payment" && (
          <div className="rounded-lg border border-dashed bg-background p-4">
            <p className="text-sm text-muted-foreground">No Stripe payment data yet. Customer has not initiated payment.</p>
          </div>
        )}

        {/* Email Status */}
        <div className="rounded-lg border bg-background p-5">
          <h3 className="font-semibold mb-4 text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Mail className="w-4 h-4" /> Email Notifications
          </h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              {order.customerConfirmationSentAt ? (
                <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 text-muted-foreground shrink-0" />
              )}
              <div>
                <p className={cn("text-sm font-medium", order.customerConfirmationSentAt ? "text-green-700" : "text-muted-foreground")}>
                  Customer confirmation {order.customerConfirmationSentAt ? "sent" : "not sent"}
                </p>
                {order.customerConfirmationSentAt && (
                  <p className="text-xs text-muted-foreground">{formatDate(order.customerConfirmationSentAt)}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {order.adminNotificationSentAt ? (
                <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 text-muted-foreground shrink-0" />
              )}
              <div>
                <p className={cn("text-sm font-medium", order.adminNotificationSentAt ? "text-green-700" : "text-muted-foreground")}>
                  Admin notification {order.adminNotificationSentAt ? "sent" : "not sent"}
                </p>
                {order.adminNotificationSentAt && (
                  <p className="text-xs text-muted-foreground">{formatDate(order.adminNotificationSentAt)}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Customer + Shipping */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-lg border bg-background p-5">
            <h3 className="font-semibold mb-3 text-sm text-muted-foreground uppercase tracking-wide">Customer</h3>
            <p className="font-medium">{order.shippingName}</p>
            <p className="text-sm text-muted-foreground">{order.customerEmail}</p>
          </div>
          <div className="rounded-lg border bg-background p-5">
            <h3 className="font-semibold mb-3 text-sm text-muted-foreground uppercase tracking-wide">Shipping Address</h3>
            <p className="text-sm">{order.shippingAddressLine1}</p>
            {order.shippingAddressLine2 && <p className="text-sm">{order.shippingAddressLine2}</p>}
            <p className="text-sm">{order.shippingPostalCode} {order.shippingCity}{order.shippingRegion ? `, ${order.shippingRegion}` : ""}</p>
            <p className="text-sm">{order.shippingCountry}</p>
          </div>
        </div>

        {order.customerNotes && (
          <div className="rounded-lg border bg-background p-5">
            <h3 className="font-semibold mb-2 text-sm text-muted-foreground uppercase tracking-wide">Customer Notes</h3>
            <p className="text-sm">{order.customerNotes}</p>
          </div>
        )}

        {/* Order Items with Print File Access */}
        <div className="rounded-lg border bg-background overflow-hidden">
          <div className="px-5 py-4 border-b">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Order Items (Snapshots)</h3>
          </div>
          <div className="divide-y">
            {order.items.map((item: AdminOrderItem, i: number) => (
              <div key={i} className="p-5 flex gap-4">
                {item.previewImageUrlSnapshot && (
                  <div className="w-16 h-20 rounded overflow-hidden bg-muted shrink-0">
                    <img src={item.previewImageUrlSnapshot} alt={item.posterTitleSnapshot} className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{item.posterTitleSnapshot}</p>
                  {item.sizeLabelSnapshot && (
                    <p className="text-sm text-muted-foreground">Size: {item.sizeLabelSnapshot}</p>
                  )}
                  {(item.widthCmSnapshot || item.heightCmSnapshot) && (
                    <p className="text-sm text-muted-foreground">
                      {item.widthCmSnapshot && item.heightCmSnapshot
                        ? `${item.widthCmSnapshot} × ${item.heightCmSnapshot} cm`
                        : item.widthCmSnapshot
                        ? `W: ${item.widthCmSnapshot} cm`
                        : `H: ${item.heightCmSnapshot} cm`}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">Qty: {item.quantity}</p>
                  <p className="text-sm text-muted-foreground">
                    {item.unitPrice} {item.currency} × {item.quantity} = <span className="font-medium text-foreground">{item.totalPrice} {item.currency}</span>
                  </p>

                  <div className="mt-2 flex flex-wrap gap-2">
                    <Link href={`/poster/${item.posterId}`} target="_blank">
                      <Button variant="outline" size="sm" className="gap-1 text-xs h-7">
                        View Poster <ExternalLink className="w-3 h-3" />
                      </Button>
                    </Link>
                    <Link href={`/admin/posters/${item.posterId}`}>
                      <Button variant="outline" size="sm" className="gap-1 text-xs h-7">
                        Admin Page <ExternalLink className="w-3 h-3" />
                      </Button>
                    </Link>
                  </div>

                  <PrintFileSection item={item} />
                </div>
                <div className="text-right shrink-0">
                  <p className="font-semibold">{item.totalPrice} {item.currency}</p>
                </div>
              </div>
            ))}
          </div>
          {/* Totals */}
          <div className="px-5 py-4 border-t bg-muted/10 space-y-1.5">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Subtotal</span>
              <span>{order.subtotal} {order.currency}</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Shipping</span>
              <span>{Number(order.shippingCost) === 0 ? "TBD" : `${order.shippingCost} ${order.currency}`}</span>
            </div>
            <div className="flex justify-between font-bold text-base pt-2 border-t">
              <span>Total</span>
              <span>{order.total} {order.currency}</span>
            </div>
          </div>
        </div>
      </div>
    </AdminDashboardLayout>
  );
}
