import React, { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Heart, User, LogOut, Package, ChevronRight, Truck, KeyRound } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface OrderItem {
  id: number;
  posterTitleSnapshot: string;
  sizeLabelSnapshot: string | null;
  quantity: number;
  totalPrice: number;
  currency: string;
  previewImageUrlSnapshot: string | null;
}

interface Order {
  id: number;
  status: string;
  subtotal: number;
  shippingCost: number;
  total: number;
  currency: string;
  shippingCity: string;
  shippingCountry: string;
  selectedShippingMethodName: string | null;
  selectedShippingMethodEstimate: string | null;
  paidAt: string | null;
  fulfillmentStatus: string;
  trackingNumber: string | null;
  createdAt: string;
  items: OrderItem[];
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: "Draft", color: "bg-gray-100 text-gray-600" },
  pending_payment: { label: "Pending Payment", color: "bg-amber-100 text-amber-700" },
  paid: { label: "Paid", color: "bg-green-100 text-green-700" },
  processing: { label: "Processing", color: "bg-blue-100 text-blue-700" },
  shipped: { label: "Shipped", color: "bg-indigo-100 text-indigo-700" },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-700" },
};

const FULFILLMENT_LABELS: Record<string, string> = {
  not_started: "Not started",
  ready_for_production: "Ready for production",
  in_production: "In production",
  shipped: "Shipped",
  cancelled: "Cancelled",
};

function formatPrice(price: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-EU", { style: "currency", currency }).format(price);
  } catch {
    return `${price.toFixed(2)} ${currency}`;
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function OrderCard({ order }: { order: Order }) {
  const status = STATUS_LABELS[order.status] ?? { label: order.status, color: "bg-gray-100 text-gray-600" };
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-background">
      <div
        className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-mono font-semibold text-sm">#{order.id}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.color}`}>
              {status.label}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
            <span>{formatDate(order.createdAt)}</span>
            <span>·</span>
            <span>{order.items.length} {order.items.length === 1 ? "item" : "items"}</span>
            <span>·</span>
            <span className="font-semibold text-foreground">{formatPrice(order.total, order.currency)}</span>
          </div>
        </div>
        <ChevronRight className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`} />
      </div>

      {expanded && (
        <div className="border-t border-border px-5 py-4 space-y-4">
          {/* Items */}
          <div className="space-y-3">
            {order.items.map((item) => (
              <div key={item.id} className="flex gap-3">
                {item.previewImageUrlSnapshot && (
                  <div className="w-12 h-16 bg-muted rounded overflow-hidden shrink-0">
                    <img src={item.previewImageUrlSnapshot} alt={item.posterTitleSnapshot} className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="text-sm">
                  <p className="font-medium">{item.posterTitleSnapshot}</p>
                  {item.sizeLabelSnapshot && <p className="text-xs text-muted-foreground">{item.sizeLabelSnapshot}</p>}
                  <p className="text-xs text-muted-foreground">Qty {item.quantity} · {formatPrice(item.totalPrice, item.currency)}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Shipping info */}
          {order.selectedShippingMethodName && (
            <div className="text-xs text-muted-foreground flex items-center gap-1.5 pt-2 border-t border-border">
              <Truck className="h-3.5 w-3.5 shrink-0" />
              <span>{order.selectedShippingMethodName}{order.selectedShippingMethodEstimate ? ` · ${order.selectedShippingMethodEstimate}` : ""}</span>
            </div>
          )}

          {/* Tracking */}
          {order.trackingNumber && (
            <div className="text-xs">
              <span className="text-muted-foreground">Tracking: </span>
              <span className="font-mono font-medium">{order.trackingNumber}</span>
            </div>
          )}

          {/* Price breakdown */}
          <div className="text-xs pt-2 border-t border-border space-y-1">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>{formatPrice(order.subtotal, order.currency)}</span>
            </div>
            {order.shippingCost > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Shipping</span>
                <span>{formatPrice(order.shippingCost, order.currency)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-foreground pt-1 border-t border-border">
              <span>Total</span>
              <span>{formatPrice(order.total, order.currency)}</span>
            </div>
          </div>

          <Link href={`/order/${order.id}`}>
            <Button variant="outline" size="sm" className="w-full mt-2">
              View full order details
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}

function OrderHistory() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    fetch("/api/user/orders", { credentials: "include" })
      .then(async r => {
        if (!r.ok) throw new Error("Failed to load orders");
        return r.json();
      })
      .then(data => {
        setOrders(data.orders ?? []);
        setTotal(data.total ?? 0);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-muted-foreground p-4 rounded-xl border border-border text-center">
        Unable to load orders. Please try again later.
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="text-center py-8">
        <Package className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">No orders yet.</p>
        <Link href="/shop">
          <Button variant="outline" size="sm" className="mt-4">Browse posters</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {orders.map(order => <OrderCard key={order.id} order={order} />)}
      {total > orders.length && (
        <p className="text-xs text-center text-muted-foreground pt-2">Showing {orders.length} of {total} orders</p>
      )}
    </div>
  );
}

function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to change password");
        return;
      }
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setOpen(false);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!open) {
    return (
      <div>
        {success && (
          <p className="text-sm text-green-700 mb-3">Password changed successfully.</p>
        )}
        <Button
          variant="outline"
          className="w-full justify-start gap-2 h-11"
          onClick={() => { setSuccess(false); setOpen(true); }}
        >
          <KeyRound className="h-4 w-4" />
          Change password
        </Button>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Change password</h3>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="current-password" className="text-xs">Current password</Label>
          <Input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-password" className="text-xs">New password</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-password" className="text-xs">Confirm new password</Label>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" size="sm" className="w-full" disabled={isLoading}>
          {isLoading ? "Saving..." : "Update password"}
        </Button>
      </form>
    </div>
  );
}

export default function Account() {
  const { user, isLoading, logout } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) {
      navigate("/login");
    }
  }, [isLoading, user, navigate]);

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-2xl">
        <div className="space-y-4 animate-pulse">
          <div className="h-8 bg-muted rounded w-1/3" />
          <div className="h-24 bg-muted rounded" />
          <div className="h-40 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-2xl">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
          <User className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <h1 className="font-serif text-2xl font-bold">Your account</h1>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
      </div>

      <div className="space-y-6">
        <section>
          <div className="flex gap-3">
            <Link href="/favorites" className="flex-1">
              <Button variant="outline" className="w-full justify-start gap-2 h-11">
                <Heart className="h-4 w-4" />
                Saved posters
              </Button>
            </Link>
            <Button
              variant="outline"
              className="gap-2 text-muted-foreground hover:text-destructive h-11"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
              Log out
            </Button>
          </div>
        </section>

        <section>
          <ChangePasswordForm />
        </section>

        <section>
          <h2 className="font-serif text-xl font-bold mb-4">Order history</h2>
          <OrderHistory />
        </section>
      </div>
    </div>
  );
}
