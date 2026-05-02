import React from "react";
import { useParams, Link } from "wouter";
import { useGetOrder, getGetOrderQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { ClockIcon, CheckCircle2, AlertCircle } from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; icon: React.FC<any>; color: string; bg: string }> = {
  draft: { label: "Draft", icon: ClockIcon, color: "text-gray-600", bg: "bg-gray-100" },
  pending_payment: { label: "Pending Payment", icon: ClockIcon, color: "text-amber-600", bg: "bg-amber-100" },
  paid: { label: "Paid", icon: CheckCircle2, color: "text-green-600", bg: "bg-green-100" },
  processing: { label: "Processing", icon: ClockIcon, color: "text-blue-600", bg: "bg-blue-100" },
  shipped: { label: "Shipped", icon: CheckCircle2, color: "text-green-600", bg: "bg-green-100" },
  cancelled: { label: "Cancelled", icon: AlertCircle, color: "text-destructive", bg: "bg-destructive/10" },
};

export default function OrderConfirmation() {
  const { id } = useParams();
  const orderId = Number(id);

  const { data: order, isLoading } = useGetOrder(orderId, {
    query: {
      enabled: !!orderId && !isNaN(orderId),
      queryKey: getGetOrderQueryKey(orderId),
    },
  });

  if (isLoading) return <div className="p-24 text-center">Loading order...</div>;
  if (!order) return <div className="p-24 text-center">Order not found</div>;

  const status = order.status ?? "pending_payment";
  const statusConfig = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending_payment;
  const StatusIcon = statusConfig.icon;
  const isPendingPayment = status === "pending_payment" || status === "draft";

  return (
    <div className="container mx-auto px-4 py-16 max-w-3xl">
      <div className="text-center mb-10">
        <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full mb-6 ${statusConfig.bg}`}>
          <StatusIcon className={`h-10 w-10 ${statusConfig.color}`} />
        </div>
        <h1 className="font-serif text-4xl font-bold mb-3">
          {isPendingPayment ? "Order Created!" : "Order Confirmed"}
        </h1>
        <p className="text-muted-foreground text-lg">
          Order #{order.id} &middot; {order.customerEmail}
        </p>
        <div className={`inline-flex items-center gap-1.5 mt-3 px-3 py-1 rounded-full text-sm font-medium ${statusConfig.bg} ${statusConfig.color}`}>
          <StatusIcon className="w-3.5 h-3.5" />
          {statusConfig.label}
        </div>
      </div>

      {isPendingPayment && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 mb-8 text-sm text-amber-800">
          <p className="font-semibold mb-1">Payment not collected yet</p>
          <p>Your order has been created but payment is not connected yet. We will contact you at <strong>{order.customerEmail}</strong> with payment instructions.</p>
        </div>
      )}

      {/* Order Items */}
      <div className="bg-sand/30 rounded-xl p-6 mb-6">
        <h2 className="font-serif text-xl font-bold mb-5 border-b pb-3">Items Ordered</h2>
        <div className="space-y-4">
          {order.items.map((item, i) => (
            <div key={i} className="flex justify-between items-start gap-4">
              <div className="flex-1">
                <p className="font-medium">{item.posterTitleSnapshot}</p>
                {item.sizeLabelSnapshot && (
                  <p className="text-sm text-muted-foreground">Size: {item.sizeLabelSnapshot}</p>
                )}
                <p className="text-sm text-muted-foreground">Qty: {item.quantity}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-medium">{item.totalPrice} {item.currency}</p>
                <p className="text-xs text-muted-foreground">{item.unitPrice} {item.currency} each</p>
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-border mt-4 pt-4 space-y-1.5">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Subtotal</span>
            <span>{order.subtotal} {order.currency}</span>
          </div>
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Shipping</span>
            <span>{Number(order.shippingCost) === 0 ? "TBD" : `${order.shippingCost} ${order.currency}`}</span>
          </div>
          <div className="flex justify-between text-xl font-bold pt-2 border-t border-border">
            <span>Total</span>
            <span>{order.total} {order.currency}</span>
          </div>
        </div>
      </div>

      {/* Shipping Details */}
      <div className="bg-sand/30 rounded-xl p-6 mb-8">
        <h2 className="font-serif text-xl font-bold mb-4 border-b pb-3">Shipping To</h2>
        <div className="text-sm space-y-0.5">
          <p className="font-medium">{order.shippingName}</p>
          <p className="text-muted-foreground">{order.shippingAddressLine1}</p>
          {order.shippingAddressLine2 && (
            <p className="text-muted-foreground">{order.shippingAddressLine2}</p>
          )}
          <p className="text-muted-foreground">
            {order.shippingPostalCode} {order.shippingCity}
            {order.shippingRegion ? `, ${order.shippingRegion}` : ""}
          </p>
          <p className="text-muted-foreground">{order.shippingCountry}</p>
        </div>
        {order.customerNotes && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs font-medium text-muted-foreground mb-1">Order Notes</p>
            <p className="text-sm">{order.customerNotes}</p>
          </div>
        )}
      </div>

      <div className="text-center">
        <Link href="/shop">
          <Button size="lg">Continue Shopping</Button>
        </Link>
      </div>
    </div>
  );
}
