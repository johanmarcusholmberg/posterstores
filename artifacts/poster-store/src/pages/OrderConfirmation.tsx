import React from "react";
import { useParams, Link } from "wouter";
import { useGetOrder, getGetOrderQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";

export default function OrderConfirmation() {
  const { id } = useParams();
  const orderId = Number(id);

  const { data: order, isLoading } = useGetOrder(orderId, {
    query: {
      enabled: !!orderId && !isNaN(orderId),
      queryKey: getGetOrderQueryKey(orderId)
    }
  });

  if (isLoading) return <div className="p-24 text-center">Loading order...</div>;

  if (!order) return <div className="p-24 text-center">Order not found</div>;

  return (
    <div className="container mx-auto px-4 py-24 max-w-3xl text-center">
      <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-8">
        <CheckCircle2 className="h-10 w-10 text-green-600" />
      </div>
      
      <h1 className="font-serif text-4xl font-bold mb-4">Thank you for your order!</h1>
      <p className="text-lg text-muted-foreground mb-12">
        Your order #{order.id} has been confirmed. We've sent a confirmation email to {order.customerEmail}.
      </p>

      <div className="bg-sand/30 rounded-xl p-8 text-left mb-12">
        <h2 className="font-serif text-2xl font-bold mb-6 border-b pb-2">Order Summary</h2>
        <div className="space-y-6">
          {order.items.map((item, i) => (
            <div key={i} className="flex justify-between items-center">
              <div>
                <p className="font-medium">Poster #{item.posterId} {item.size && `(${item.size})`}</p>
                <p className="text-sm text-muted-foreground">Qty: {item.quantity}</p>
              </div>
              <p className="font-medium">{item.price} {order.currency}</p>
            </div>
          ))}
          <div className="border-t border-border pt-4 flex justify-between text-xl font-bold">
            <span>Total</span>
            <span>{order.total} {order.currency}</span>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-border">
          <h3 className="font-medium mb-2">Shipping to:</h3>
          <p className="text-muted-foreground whitespace-pre-line">{order.shippingAddress}</p>
          <p className="text-muted-foreground mt-2">{order.customerName}</p>
        </div>
      </div>

      <Link href="/shop">
        <Button size="lg">Continue Shopping</Button>
      </Link>
    </div>
  );
}
