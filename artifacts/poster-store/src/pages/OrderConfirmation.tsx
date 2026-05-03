import React, { useCallback, useState } from "react";
import { useParams, Link, useSearch } from "wouter";
import { useGetOrder, getGetOrderQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle, XCircle, ShoppingBag, Package, Download } from "lucide-react";
import { useStorefront } from "@/context/StorefrontContext";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const STATUS_CONFIG: Record<string, { label: string; icon: React.FC<any>; color: string; bg: string }> = {
  draft: { label: "Draft", icon: Package, color: "text-gray-600", bg: "bg-gray-100" },
  pending_payment: { label: "Pending Payment", icon: ShoppingBag, color: "text-amber-600", bg: "bg-amber-100" },
  paid: { label: "Paid", icon: CheckCircle2, color: "text-green-600", bg: "bg-green-100" },
  processing: { label: "Processing", icon: Package, color: "text-blue-600", bg: "bg-blue-100" },
  shipped: { label: "Shipped", icon: CheckCircle2, color: "text-green-600", bg: "bg-green-100" },
  cancelled: { label: "Cancelled", icon: AlertCircle, color: "text-destructive", bg: "bg-destructive/10" },
};

export default function OrderConfirmation() {
  const { id } = useParams();
  const orderId = Number(id);
  const store = useStorefront();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const paymentParam = params.get("payment");
  const [closeFailed, setCloseFailed] = useState(false);

  const { data: order, isLoading } = useGetOrder(orderId, {
    query: {
      enabled: !!orderId && !isNaN(orderId),
      queryKey: getGetOrderQueryKey(orderId),
      refetchInterval: paymentParam === "success" ? 3000 : false,
      refetchIntervalInBackground: false,
    },
  });

  const downloadReceipt = useCallback(() => {
    if (!order) return;
    const doc = new jsPDF();
    const orderAny = order as any;

    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("Order Receipt", 14, 24);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(`Order #${order.id}`, 14, 34);
    doc.text(`Date: ${order.createdAt ? new Date(order.createdAt).toLocaleDateString() : new Date().toLocaleDateString()}`, 14, 40);
    doc.text(`Email: ${order.customerEmail}`, 14, 46);
    if (orderAny.paidAt) {
      doc.text(`Paid: ${new Date(orderAny.paidAt).toLocaleString()}`, 14, 52);
    }

    doc.setTextColor(0);

    autoTable(doc, {
      startY: 62,
      head: [["Item", "Size", "Qty", "Unit Price", "Total"]],
      body: order.items.map((item) => [
        item.posterTitleSnapshot,
        item.sizeLabelSnapshot || "—",
        String(item.quantity),
        `${item.unitPrice} ${item.currency}`,
        `${item.totalPrice} ${item.currency}`,
      ]),
      headStyles: { fillColor: [40, 40, 40] },
      styles: { fontSize: 10 },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Subtotal: ${order.subtotal} ${order.currency}`, 130, finalY, { align: "left" });
    doc.text(
      `Shipping: ${Number(order.shippingCost) === 0 ? "TBD" : `${order.shippingCost} ${order.currency}`}`,
      130,
      finalY + 7,
      { align: "left" }
    );
    doc.setTextColor(0);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(`Total: ${order.total} ${order.currency}`, 130, finalY + 16, { align: "left" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(60);
    doc.text("Shipping To:", 14, finalY + 10);
    doc.setTextColor(0);
    const addr = [
      order.shippingName,
      order.shippingAddressLine1,
      order.shippingAddressLine2,
      `${order.shippingPostalCode} ${order.shippingCity}${order.shippingRegion ? ", " + order.shippingRegion : ""}`,
      order.shippingCountry,
    ].filter(Boolean);
    addr.forEach((line, i) => {
      doc.text(line!, 14, finalY + 18 + i * 6);
    });

    doc.save(`receipt-order-${order.id}.pdf`);
  }, [order]);

  const handleCloseWindow = () => {
    window.close();
    setTimeout(() => setCloseFailed(true), 400);
  };

  if (isLoading) return <div className="p-24 text-center">Loading order...</div>;
  if (!order) return <div className="p-24 text-center">Order not found</div>;

  const status = order.status ?? "pending_payment";
  const statusConfig = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending_payment;
  const StatusIcon = statusConfig.icon;
  const isPaid = status === "paid";
  const isPendingPayment = status === "pending_payment" || status === "draft";
  const isCancelled = status === "cancelled";
  const orderAny = order as any;

  const retryCheckout = async () => {
    try {
      const res = await fetch(
        `/api/orders/${order.id}/create-checkout-session?storeKey=${encodeURIComponent(store.storeKey)}`,
        { method: "POST", headers: { "Content-Type": "application/json" } }
      );
      if (res.ok) {
        const { checkoutUrl } = await res.json();
        if (checkoutUrl) window.location.href = checkoutUrl;
      }
    } catch {
    }
  };

  return (
    <div className="container mx-auto px-4 py-16 max-w-3xl">
      <div className="text-center mb-10">
        <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full mb-6 ${isPaid ? "bg-green-100" : statusConfig.bg}`}>
          {isPaid ? (
            <CheckCircle2 className="h-10 w-10 text-green-600" />
          ) : (
            <StatusIcon className={`h-10 w-10 ${statusConfig.color}`} />
          )}
        </div>
        <h1 className="font-serif text-4xl font-bold mb-3">
          {isPaid ? "Order Confirmed!" : isPendingPayment ? "Order Created" : isCancelled ? "Order Cancelled" : "Order Status"}
        </h1>
        <p className="text-muted-foreground text-lg">
          Order #{order.id} &middot; {order.customerEmail}
        </p>
        <div className={`inline-flex items-center gap-1.5 mt-3 px-3 py-1 rounded-full text-sm font-medium ${statusConfig.bg} ${statusConfig.color}`}>
          <StatusIcon className="w-3.5 h-3.5" />
          {statusConfig.label}
        </div>
      </div>

      {/* Payment confirmed */}
      {isPaid && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-5 mb-8 text-sm text-green-800">
          <p className="font-semibold mb-1 text-base">Payment received. Your order is confirmed.</p>
          <p className="mb-3">
            A confirmation summary has been sent to <strong>{order.customerEmail}</strong>. Thank you for your purchase!
          </p>
          {orderAny.paidAt && (
            <p className="text-green-700 text-xs mb-4">Paid: {new Date(orderAny.paidAt).toLocaleString()}</p>
          )}
          <Button
            size="sm"
            variant="outline"
            className="border-green-600 text-green-700 hover:bg-green-100 gap-2"
            onClick={downloadReceipt}
          >
            <Download className="w-4 h-4" />
            Download Receipt (PDF)
          </Button>
        </div>
      )}

      {/* Verifying payment */}
      {paymentParam === "success" && !isPaid && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 mb-8 text-sm text-blue-800">
          <p className="font-semibold mb-1">Payment is being verified.</p>
          <p>We received your payment and are verifying it now. This page will update automatically. Please wait a moment.</p>
        </div>
      )}

      {/* Cancelled */}
      {paymentParam === "cancelled" && isPendingPayment && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 mb-8 text-sm text-amber-800">
          <div className="flex items-start gap-2">
            <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold mb-1">Payment was cancelled</p>
              <p className="mb-3">Your order has not been paid. You can retry payment below.</p>
              <Button size="sm" onClick={retryCheckout}>
                Retry Payment
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Default pending */}
      {isPendingPayment && !paymentParam && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 mb-8 text-sm text-amber-800">
          <p className="font-semibold mb-1">Payment pending</p>
          <p>Your order has been created but payment has not been completed yet.</p>
          <Button size="sm" className="mt-3" onClick={retryCheckout}>
            Complete Payment
          </Button>
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

      {/* Close window / continue */}
      <div className="text-center space-y-3">
        {isPaid && (
          <>
            {closeFailed ? (
              <p className="text-sm text-muted-foreground mb-2">
                You can safely close this tab now.
              </p>
            ) : (
              <Button variant="outline" size="lg" onClick={handleCloseWindow} className="mr-3">
                Close Window
              </Button>
            )}
          </>
        )}
        <Link href="/shop">
          <Button size="lg" variant={isPaid ? "ghost" : "default"}>Continue Shopping</Button>
        </Link>
      </div>
    </div>
  );
}
