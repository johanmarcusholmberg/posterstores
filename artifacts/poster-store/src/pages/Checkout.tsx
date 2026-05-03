import React, { useEffect, useState } from "react";
import { useGetCart, getGetCartQueryKey, useCreateOrder } from "@workspace/api-client-react";
import { getSessionId } from "@/lib/session";
import { useStorefront } from "@/context/StorefrontContext";
import { useLocation, useSearch } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, XCircle } from "lucide-react";

const checkoutSchema = z.object({
  customerEmail: z.string().email("Valid email is required"),
  shippingName: z.string().min(1, "Full name is required"),
  shippingAddressLine1: z.string().min(1, "Address is required"),
  shippingAddressLine2: z.string().optional(),
  shippingPostalCode: z.string().min(1, "Postal code is required"),
  shippingCity: z.string().min(1, "City is required"),
  shippingRegion: z.string().optional(),
  shippingCountry: z.string().min(1, "Country is required"),
  customerNotes: z.string().optional(),
  newsletterOptIn: z.boolean().optional(),
});

type CheckoutFormValues = z.infer<typeof checkoutSchema>;

export default function Checkout() {
  const sessionId = getSessionId();
  const store = useStorefront();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [redirecting, setRedirecting] = useState(false);
  const [stripeError, setStripeError] = useState<string | null>(null);

  const params = new URLSearchParams(search);
  const paymentCancelled = params.get("payment") === "cancelled";
  const cancelledOrderId = params.get("orderId");

  const cartParams = { sessionId, storeKey: store.storeKey };

  const { data: cart, isLoading: cartLoading } = useGetCart(cartParams, {
    query: {
      enabled: !!sessionId,
      queryKey: getGetCartQueryKey(cartParams),
    },
  });

  const createOrder = useCreateOrder();

  const form = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      customerEmail: "",
      shippingName: "",
      shippingAddressLine1: "",
      shippingAddressLine2: "",
      shippingPostalCode: "",
      shippingCity: "",
      shippingRegion: "",
      shippingCountry: "",
      customerNotes: "",
      newsletterOptIn: false,
    },
  });

  const onSubmit = (values: CheckoutFormValues) => {
    if (!cart || cart.items.length === 0) return;
    setStripeError(null);

    createOrder.mutate(
      {
        data: {
          storeKey: store.storeKey,
          sessionId,
          customerEmail: values.customerEmail,
          shippingName: values.shippingName,
          shippingAddressLine1: values.shippingAddressLine1,
          shippingAddressLine2: values.shippingAddressLine2 || undefined,
          shippingPostalCode: values.shippingPostalCode,
          shippingCity: values.shippingCity,
          shippingRegion: values.shippingRegion || undefined,
          shippingCountry: values.shippingCountry,
          customerNotes: values.customerNotes || undefined,
          newsletterOptIn: values.newsletterOptIn ?? false,
        },
      },
      {
        onSuccess: async (order) => {
          queryClient.invalidateQueries({ queryKey: getGetCartQueryKey(cartParams) });

          try {
            setRedirecting(true);
            const res = await fetch(
              `/api/orders/${order.id}/create-checkout-session?storeKey=${encodeURIComponent(store.storeKey)}`,
              { method: "POST", headers: { "Content-Type": "application/json" } }
            );

            if (!res.ok) {
              const body = await res.json().catch(() => ({}));
              const msg = (body as any)?.error ?? "Failed to create payment session";
              setStripeError(msg);
              setRedirecting(false);
              setLocation(`/order/${order.id}`);
              return;
            }

            const { checkoutUrl } = await res.json();
            if (checkoutUrl) {
              window.location.href = checkoutUrl;
            } else {
              setRedirecting(false);
              setLocation(`/order/${order.id}`);
            }
          } catch (err: any) {
            setStripeError(err?.message ?? "Failed to redirect to payment");
            setRedirecting(false);
            setLocation(`/order/${order.id}`);
          }
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.error ?? err?.message ?? "Failed to place order";
          toast({ variant: "destructive", title: "Order failed", description: msg });
        },
      }
    );
  };

  const shouldRedirect = !cartLoading && (!cart || cart.items.length === 0) && !paymentCancelled;

  useEffect(() => {
    if (shouldRedirect) setLocation("/cart");
  }, [shouldRedirect, setLocation]);

  if (cartLoading) return <div className="p-24 text-center">Loading...</div>;

  if (redirecting) {
    return (
      <div className="p-24 text-center">
        <p className="text-lg font-medium">Redirecting to secure payment...</p>
        <p className="text-muted-foreground text-sm mt-2">Please do not close this page.</p>
      </div>
    );
  }

  if (shouldRedirect) return null;

  const currency = cart ? ((cart as any).currency || cart.items[0]?.poster?.currency || store.defaultCurrency) : store.defaultCurrency;

  return (
    <div className="container mx-auto px-4 py-12 max-w-6xl">
      <h1 className="font-serif text-4xl font-bold mb-2">Checkout</h1>
      <p className="text-muted-foreground mb-10">Fill in your details to proceed to payment</p>

      {paymentCancelled && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 mb-8 text-sm text-amber-800">
          <XCircle className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
          <div>
            <p className="font-semibold mb-1">Payment was cancelled</p>
            <p>
              Your order has not been paid.{cancelledOrderId ? ` Order #${cancelledOrderId} is still pending.` : ""} You can complete your payment below or return to your cart.
            </p>
          </div>
        </div>
      )}

      {stripeError && (
        <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive mb-6">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{stripeError}</span>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-12">
        <div className="flex-1">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

              {/* Contact */}
              <div className="space-y-4">
                <h2 className="font-serif text-2xl font-bold border-b pb-2">Contact</h2>
                <FormField
                  control={form.control}
                  name="customerEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address *</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="you@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Shipping */}
              <div className="space-y-4">
                <h2 className="font-serif text-2xl font-bold border-b pb-2">Shipping Address</h2>
                <FormField
                  control={form.control}
                  name="shippingName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="Jane Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="shippingAddressLine1"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Address Line 1 *</FormLabel>
                      <FormControl>
                        <Input placeholder="123 Main Street" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="shippingAddressLine2"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Address Line 2 <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                      <FormControl>
                        <Input placeholder="Apt, suite, floor..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="shippingPostalCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Postal Code *</FormLabel>
                        <FormControl>
                          <Input placeholder="28001" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="shippingCity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>City *</FormLabel>
                        <FormControl>
                          <Input placeholder="Madrid" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="shippingRegion"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Region / State <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                        <FormControl>
                          <Input placeholder="Community of Madrid" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="shippingCountry"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Country *</FormLabel>
                        <FormControl>
                          <Input placeholder="Spain" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-4">
                <h2 className="font-serif text-2xl font-bold border-b pb-2">Additional Information</h2>
                <FormField
                  control={form.control}
                  name="customerNotes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Order Notes <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                      <FormControl>
                        <Textarea placeholder="Any special instructions for your order..." rows={3} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="newsletterOptIn"
                  render={({ field }) => (
                    <FormItem className="flex items-start gap-3">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          className="mt-0.5"
                        />
                      </FormControl>
                      <div>
                        <FormLabel className="font-normal cursor-pointer">
                          Keep me updated with news and new poster releases
                        </FormLabel>
                      </div>
                    </FormItem>
                  )}
                />
              </div>

              {createOrder.error && (
                <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    {(createOrder.error as any)?.response?.data?.error ?? "Something went wrong. Please check your cart and try again."}
                  </span>
                </div>
              )}

              <Button
                type="submit"
                size="lg"
                className="w-full h-14 text-lg mt-8"
                disabled={createOrder.isPending || redirecting}
              >
                {createOrder.isPending
                  ? "Creating order..."
                  : redirecting
                  ? "Redirecting to payment..."
                  : `Pay Now — ${cart?.total ?? ""} ${currency}`}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                You will be redirected to Stripe's secure checkout to complete payment.
              </p>
            </form>
          </Form>
        </div>

        {/* Order Summary */}
        {cart && (
          <div className="w-full lg:w-96 shrink-0">
            <div className="bg-sand/30 p-6 rounded-lg sticky top-24">
              <h2 className="font-serif text-xl font-bold mb-6">Order Summary</h2>
              <div className="space-y-4 mb-6">
                {cart.items.map((item) => {
                  const anyItem = item as any;
                  return (
                    <div key={item.id} className="flex gap-4">
                      <div className="w-16 h-20 bg-muted rounded overflow-hidden shrink-0">
                        <img src={item.poster?.imageUrl} className="w-full h-full object-cover" alt={item.poster?.title} />
                      </div>
                      <div className="flex-1 text-sm">
                        <p className="font-medium">{item.poster?.title}</p>
                        {anyItem.size && <p className="text-muted-foreground">Size: {anyItem.size}</p>}
                        <p className="text-muted-foreground">Qty: {item.quantity}</p>
                        <p className="font-medium mt-1">
                          {anyItem.unitPrice ?? item.poster?.price} {anyItem.currency ?? item.poster?.currency}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="border-t border-border pt-4 space-y-2">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Subtotal</span>
                  <span>{cart.total} {currency}</span>
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Shipping</span>
                  <span>Calculated at payment</span>
                </div>
                <div className="flex justify-between font-bold text-lg pt-2 border-t border-border">
                  <span>Total</span>
                  <span>{cart.total} {currency}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
