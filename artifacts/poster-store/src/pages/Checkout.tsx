import React, { useEffect, useState } from "react";
import { useGetCart, getGetCartQueryKey } from "@workspace/api-client-react";
import { getSessionId } from "@/lib/session";
import { useStorefront } from "@/context/StorefrontContext";
import { useAuth } from "@/context/AuthContext";
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
import { AlertCircle, XCircle, CheckCircle2, Truck, Shield, Package, UserPlus } from "lucide-react";

interface ShippingMethod {
  id: number;
  name: string;
  description: string | null;
  courierName: string | null;
  deliveryEstimate: string | null;
  price: number;
  currency: string;
}

const STEPS = ["Details", "Shipping", "Payment"] as const;
type Step = 0 | 1 | 2;

const checkoutSchema = z.object({
  customerEmail: z.string().email("Valid email is required"),
  customerPhone: z.string().optional(),
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

function formatPrice(price: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-EU", { style: "currency", currency }).format(price);
  } catch {
    const symbols: Record<string, string> = { EUR: "€", SEK: "kr", USD: "$", GBP: "£" };
    const s = symbols[currency] ?? currency;
    return `${s}${price.toFixed(2)}`;
  }
}

function StepIndicator({ step }: { step: Step }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-10">
      {STEPS.map((label, i) => {
        const isComplete = i < step;
        const isActive = i === step;
        return (
          <React.Fragment key={label}>
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-all ${
                isComplete
                  ? "bg-primary border-primary text-primary-foreground"
                  : isActive
                  ? "border-primary text-primary bg-background"
                  : "border-border text-muted-foreground bg-background"
              }`}>
                {isComplete ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
              </div>
              <span className={`mt-1.5 text-xs font-medium ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 w-12 sm:w-16 mb-5 mx-1 transition-all ${i < step ? "bg-primary" : "bg-border"}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default function Checkout() {
  const sessionId = getSessionId();
  const store = useStorefront();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>(0);
  const [redirecting, setRedirecting] = useState(false);
  const [stripeError, setStripeError] = useState<string | null>(null);
  const [shippingMethods, setShippingMethods] = useState<ShippingMethod[]>([]);
  const [selectedMethodId, setSelectedMethodId] = useState<number | null>(null);
  const [shippingLoading, setShippingLoading] = useState(false);

  const [wantsAccount, setWantsAccount] = useState(false);
  const [accountPassword, setAccountPassword] = useState("");
  const [accountPasswordError, setAccountPasswordError] = useState<string | null>(null);

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

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      customerEmail: "",
      customerPhone: "",
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

  const shippingCountry = form.watch("shippingCountry");

  useEffect(() => {
    if (step !== 1) return;
    setShippingLoading(true);
    const qs = new URLSearchParams({ storeKey: store.storeKey });
    if (shippingCountry) qs.set("country", shippingCountry);
    fetch(`/api/shipping-methods?${qs}`)
      .then(r => r.json())
      .then(data => {
        setShippingMethods(Array.isArray(data) ? data : []);
        if (Array.isArray(data) && data.length > 0 && !selectedMethodId) {
          setSelectedMethodId(data[0].id);
        }
      })
      .catch(() => setShippingMethods([]))
      .finally(() => setShippingLoading(false));
  }, [step, store.storeKey, shippingCountry]);

  const selectedMethod = shippingMethods.find(m => m.id === selectedMethodId) ?? null;
  const currency = cart ? ((cart as any).currency || store.defaultCurrency || "EUR") : (store.defaultCurrency || "EUR");
  const shippingCost = selectedMethod?.price ?? 0;
  const cartTotal = cart?.total ?? 0;
  const orderTotal = cartTotal + shippingCost;

  const proceedToShipping = async () => {
    const valid = await form.trigger([
      "customerEmail", "customerPhone", "shippingName",
      "shippingAddressLine1", "shippingPostalCode", "shippingCity", "shippingCountry",
    ]);
    if (!valid) return;

    if (wantsAccount) {
      if (accountPassword.length < 6) {
        setAccountPasswordError("Password must be at least 6 characters");
        return;
      }
      setAccountPasswordError(null);
    }

    setStep(1);
  };

  const proceedToPayment = () => {
    if (!selectedMethodId && shippingMethods.length > 0) {
      toast({ variant: "destructive", title: "Select a shipping method", description: "Please choose a shipping option to continue." });
      return;
    }
    setStep(2);
  };

  const onSubmit = async (values: CheckoutFormValues) => {
    if (!cart || cart.items.length === 0) return;
    setStripeError(null);
    setSubmitError(null);
    setIsSubmitting(true);

    if (!user && wantsAccount && accountPassword.length >= 6) {
      try {
        const regRes = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email: values.customerEmail, password: accountPassword }),
        });
        if (!regRes.ok) {
          const body = await regRes.json().catch(() => ({}));
          const msg = (body as any)?.error ?? "Account creation failed";
          toast({ title: "Account note", description: msg + " — continuing as guest.", duration: 5000 });
        }
      } catch {
        // non-fatal — proceed with order as guest
      }
    }

    try {
      const orderRes = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          storeKey: store.storeKey,
          sessionId,
          customerEmail: values.customerEmail,
          customerPhone: values.customerPhone || null,
          shippingName: values.shippingName,
          shippingAddressLine1: values.shippingAddressLine1,
          shippingAddressLine2: values.shippingAddressLine2 || null,
          shippingPostalCode: values.shippingPostalCode,
          shippingCity: values.shippingCity,
          shippingRegion: values.shippingRegion || null,
          shippingCountry: values.shippingCountry,
          shippingMethodId: selectedMethodId,
          customerNotes: values.customerNotes || null,
          newsletterOptIn: values.newsletterOptIn ?? false,
        }),
      });

      if (!orderRes.ok) {
        const body = await orderRes.json().catch(() => ({}));
        const msg = (body as any)?.error ?? "Failed to place order";
        setSubmitError(msg);
        toast({ variant: "destructive", title: "Order failed", description: msg });
        setIsSubmitting(false);
        return;
      }

      const order = await orderRes.json();
      queryClient.invalidateQueries({ queryKey: getGetCartQueryKey(cartParams) });

      try {
        setRedirecting(true);
        const sessionRes = await fetch(
          `/api/orders/${order.id}/create-checkout-session?storeKey=${encodeURIComponent(store.storeKey)}`,
          { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include" }
        );

        if (!sessionRes.ok) {
          const body = await sessionRes.json().catch(() => ({}));
          const msg = (body as any)?.error ?? "Failed to create payment session";
          setStripeError(msg);
          setRedirecting(false);
          setIsSubmitting(false);
          setLocation(`/order/${order.id}`);
          return;
        }

        const { checkoutUrl } = await sessionRes.json();
        if (checkoutUrl) {
          window.location.href = checkoutUrl;
        } else {
          setRedirecting(false);
          setIsSubmitting(false);
          setLocation(`/order/${order.id}`);
        }
      } catch (err: any) {
        setStripeError(err?.message ?? "Failed to redirect to payment");
        setRedirecting(false);
        setIsSubmitting(false);
        setLocation(`/order/${order.id}`);
      }
    } catch (err: any) {
      const msg = err?.message ?? "Network error. Please try again.";
      setSubmitError(msg);
      toast({ variant: "destructive", title: "Order failed", description: msg });
      setIsSubmitting(false);
    }
  };

  const shouldRedirect = !cartLoading && (!cart || cart.items.length === 0) && !paymentCancelled;

  useEffect(() => {
    if (shouldRedirect) setLocation("/cart");
  }, [shouldRedirect, setLocation]);

  if (cartLoading) return <div className="p-24 text-center text-muted-foreground">Loading...</div>;

  if (redirecting) {
    return (
      <div className="p-24 text-center">
        <div className="w-12 h-12 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-lg font-medium">Redirecting to secure payment...</p>
        <p className="text-muted-foreground text-sm mt-2">Please do not close this page.</p>
      </div>
    );
  }

  if (shouldRedirect) return null;

  return (
    <div className="container mx-auto px-4 py-10 max-w-6xl">
      <div className="mb-8 text-center">
        <h1 className="font-serif text-3xl sm:text-4xl font-bold mb-6">Checkout</h1>
        <StepIndicator step={step} />
      </div>

      {paymentCancelled && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 mb-8 text-sm text-amber-800 max-w-2xl mx-auto">
          <XCircle className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
          <div>
            <p className="font-semibold mb-1">Payment was cancelled</p>
            <p>Your order has not been charged.{cancelledOrderId ? ` Order #${cancelledOrderId} is still pending.` : ""} Complete the form below to retry.</p>
          </div>
        </div>
      )}

      {stripeError && (
        <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive mb-6 max-w-2xl mx-auto">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{stripeError}</span>
        </div>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <div className="flex flex-col lg:flex-row gap-10">
            {/* Left: Steps */}
            <div className="flex-1 min-w-0">

              {/* Step 0: Contact + Address */}
              {step === 0 && (
                <div className="space-y-8">
                  <section className="space-y-4">
                    <h2 className="font-serif text-xl font-bold pb-2 border-b border-border">Contact</h2>
                    <FormField
                      control={form.control}
                      name="customerEmail"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email address *</FormLabel>
                          <FormControl>
                            <Input type="email" autoComplete="email" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="customerPhone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone number <span className="text-muted-foreground text-xs">(optional, for delivery)</span></FormLabel>
                          <FormControl>
                            <Input type="tel" autoComplete="tel" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Account creation for guests */}
                    {!user && (
                      <div className="pt-1 space-y-3">
                        <label className="flex items-start gap-3 cursor-pointer group">
                          <Checkbox
                            checked={wantsAccount}
                            onCheckedChange={(v) => {
                              setWantsAccount(!!v);
                              setAccountPasswordError(null);
                            }}
                            className="mt-0.5"
                          />
                          <div>
                            <span className="text-sm font-medium flex items-center gap-1.5">
                              <UserPlus className="h-3.5 w-3.5 text-muted-foreground" />
                              Create an account to track your orders
                            </span>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Save your details for next time and view order history.
                            </p>
                          </div>
                        </label>

                        {wantsAccount && (
                          <div className="ml-7 space-y-1.5">
                            <label className="text-sm font-medium">Choose a password *</label>
                            <Input
                              type="password"
                              autoComplete="new-password"
                              value={accountPassword}
                              onChange={e => {
                                setAccountPassword(e.target.value);
                                if (accountPasswordError) setAccountPasswordError(null);
                              }}
                            />
                            {accountPasswordError && (
                              <p className="text-xs text-destructive">{accountPasswordError}</p>
                            )}
                            <p className="text-xs text-muted-foreground">At least 6 characters</p>
                          </div>
                        )}
                      </div>
                    )}
                  </section>

                  <section className="space-y-4">
                    <h2 className="font-serif text-xl font-bold pb-2 border-b border-border">Shipping Address</h2>
                    <FormField
                      control={form.control}
                      name="shippingName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Full name *</FormLabel>
                          <FormControl>
                            <Input autoComplete="name" {...field} />
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
                          <FormLabel>Street address *</FormLabel>
                          <FormControl>
                            <Input autoComplete="address-line1" {...field} />
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
                          <FormLabel>Apt, suite, floor <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                          <FormControl>
                            <Input autoComplete="address-line2" {...field} />
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
                            <FormLabel>Postal code *</FormLabel>
                            <FormControl>
                              <Input autoComplete="postal-code" {...field} />
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
                              <Input autoComplete="address-level2" {...field} />
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
                              <Input autoComplete="address-level1" {...field} />
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
                              <Input autoComplete="country-name" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </section>

                  <section className="space-y-4">
                    <h2 className="font-serif text-xl font-bold pb-2 border-b border-border">Additional notes</h2>
                    <FormField
                      control={form.control}
                      name="customerNotes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Order notes <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                          <FormControl>
                            <Textarea rows={3} {...field} />
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
                            <Checkbox checked={field.value} onCheckedChange={field.onChange} className="mt-0.5" />
                          </FormControl>
                          <FormLabel className="font-normal cursor-pointer text-sm text-muted-foreground">
                            Keep me updated with news and new poster releases
                          </FormLabel>
                        </FormItem>
                      )}
                    />
                  </section>

                  <Button type="button" size="lg" className="w-full h-12" onClick={proceedToShipping}>
                    Continue to shipping →
                  </Button>
                </div>
              )}

              {/* Step 1: Shipping method */}
              {step === 1 && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h2 className="font-serif text-xl font-bold">Shipping Method</h2>
                    <button type="button" onClick={() => setStep(0)} className="text-sm text-muted-foreground hover:text-foreground">
                      ← Edit details
                    </button>
                  </div>

                  <div className="rounded-lg border border-border p-4 bg-muted/20 text-sm space-y-0.5">
                    <p className="font-medium">{form.getValues("shippingName")}</p>
                    <p className="text-muted-foreground">{form.getValues("shippingAddressLine1")}{form.getValues("shippingAddressLine2") ? `, ${form.getValues("shippingAddressLine2")}` : ""}</p>
                    <p className="text-muted-foreground">{form.getValues("shippingPostalCode")} {form.getValues("shippingCity")}{form.getValues("shippingRegion") ? `, ${form.getValues("shippingRegion")}` : ""}</p>
                    <p className="text-muted-foreground">{form.getValues("shippingCountry")}</p>
                  </div>

                  {shippingLoading ? (
                    <div className="space-y-3">
                      {[1, 2].map(i => (
                        <div key={i} className="h-20 rounded-lg border border-border bg-muted/20 animate-pulse" />
                      ))}
                    </div>
                  ) : shippingMethods.length === 0 ? (
                    <div className="rounded-lg border border-border p-6 text-center text-muted-foreground text-sm">
                      <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p>No shipping options available for your location.</p>
                      <p className="mt-1">Please contact us for assistance.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {shippingMethods.map((method) => {
                        const isSelected = selectedMethodId === method.id;
                        return (
                          <button
                            type="button"
                            key={method.id}
                            className={`w-full text-left rounded-lg border-2 p-4 transition-all ${
                              isSelected
                                ? "border-primary bg-primary/5"
                                : "border-border hover:border-border/80 bg-background"
                            }`}
                            onClick={() => setSelectedMethodId(method.id)}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-3">
                                <div className={`w-4 h-4 mt-0.5 rounded-full border-2 shrink-0 flex items-center justify-center ${
                                  isSelected ? "border-primary" : "border-muted-foreground/40"
                                }`}>
                                  {isSelected && <div className="w-2 h-2 rounded-full bg-primary" />}
                                </div>
                                <div>
                                  <p className="font-medium text-sm">{method.name}</p>
                                  {method.courierName && (
                                    <p className="text-xs text-muted-foreground mt-0.5">{method.courierName}</p>
                                  )}
                                  {method.description && (
                                    <p className="text-xs text-muted-foreground mt-0.5">{method.description}</p>
                                  )}
                                  {method.deliveryEstimate && (
                                    <div className="flex items-center gap-1 mt-1">
                                      <Truck className="h-3 w-3 text-muted-foreground" />
                                      <p className="text-xs text-muted-foreground">{method.deliveryEstimate}</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <p className="font-semibold text-sm shrink-0">
                                {method.price === 0 ? "Free" : formatPrice(method.price, method.currency)}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <Button
                    type="button"
                    size="lg"
                    className="w-full h-12"
                    onClick={proceedToPayment}
                    disabled={shippingMethods.length > 0 && !selectedMethodId}
                  >
                    Continue to payment →
                  </Button>
                </div>
              )}

              {/* Step 2: Review + Pay */}
              {step === 2 && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h2 className="font-serif text-xl font-bold">Review & Pay</h2>
                    <button type="button" onClick={() => setStep(1)} className="text-sm text-muted-foreground hover:text-foreground">
                      ← Edit shipping
                    </button>
                  </div>

                  {/* Address summary */}
                  <div className="rounded-lg border border-border p-4 bg-muted/20 text-sm">
                    <p className="font-medium text-xs text-muted-foreground uppercase tracking-wider mb-2">Delivering to</p>
                    <p className="font-medium">{form.getValues("shippingName")}</p>
                    <p className="text-muted-foreground">{form.getValues("shippingAddressLine1")}</p>
                    <p className="text-muted-foreground">{form.getValues("shippingPostalCode")} {form.getValues("shippingCity")}, {form.getValues("shippingCountry")}</p>
                  </div>

                  {/* Shipping summary */}
                  {selectedMethod && (
                    <div className="rounded-lg border border-border p-4 bg-muted/20 text-sm">
                      <p className="font-medium text-xs text-muted-foreground uppercase tracking-wider mb-2">Shipping method</p>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{selectedMethod.name}</p>
                          {selectedMethod.deliveryEstimate && (
                            <p className="text-muted-foreground text-xs mt-0.5">{selectedMethod.deliveryEstimate}</p>
                          )}
                        </div>
                        <p className="font-semibold">{selectedMethod.price === 0 ? "Free" : formatPrice(selectedMethod.price, selectedMethod.currency)}</p>
                      </div>
                    </div>
                  )}

                  {submitError && (
                    <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>{submitError}</span>
                    </div>
                  )}

                  <div className="border border-border rounded-lg overflow-hidden">
                    <div className="flex items-center gap-3 bg-muted/20 px-4 py-3 border-b border-border">
                      <Shield className="h-4 w-4 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">You will be redirected to Stripe's secure payment page</p>
                    </div>
                    <div className="p-4">
                      <Button
                        type="submit"
                        size="lg"
                        className="w-full h-12 text-base font-semibold"
                        disabled={isSubmitting || redirecting}
                      >
                        {isSubmitting || redirecting
                          ? "Processing..."
                          : `Pay ${formatPrice(orderTotal, currency)}`}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right: Order Summary */}
            {cart && (
              <div className="w-full lg:w-80 xl:w-96 shrink-0">
                <div className="bg-muted/30 border border-border/60 rounded-xl p-6 sticky top-24">
                  <h2 className="font-serif text-lg font-bold mb-5">Order Summary</h2>

                  <div className="space-y-3 mb-5">
                    {cart.items.map((item) => {
                      const anyItem = item as any;
                      const unitPrice = anyItem.unitPrice ?? item.poster?.price ?? 0;
                      const itemCurrency = anyItem.currency ?? currency;
                      const lineTotal = unitPrice * item.quantity;
                      return (
                        <div key={item.id} className="flex gap-3">
                          <div className="w-14 h-[4.5rem] bg-muted rounded overflow-hidden shrink-0">
                            {item.poster?.imageUrl && (
                              <img src={item.poster.imageUrl} className="w-full h-full object-cover" alt={item.poster?.title} />
                            )}
                          </div>
                          <div className="flex-1 min-w-0 text-sm">
                            <p className="font-medium truncate">{item.poster?.title}</p>
                            {anyItem.size && <p className="text-muted-foreground text-xs">{anyItem.size}</p>}
                            <p className="text-muted-foreground text-xs">Qty {item.quantity}</p>
                            <p className="font-semibold text-xs mt-0.5">{formatPrice(lineTotal, itemCurrency)}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="border-t border-border pt-4 space-y-2 text-sm">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Subtotal</span>
                      <span>{formatPrice(cartTotal, currency)}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Shipping</span>
                      <span>
                        {step === 0
                          ? "Calculated next"
                          : selectedMethod
                          ? (selectedMethod.price === 0 ? "Free" : formatPrice(selectedMethod.price, selectedMethod.currency))
                          : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between font-bold text-base pt-2 border-t border-border">
                      <span>Total</span>
                      <span>{formatPrice(step === 0 ? cartTotal : orderTotal, currency)}</span>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-border space-y-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Shield className="h-3 w-3 shrink-0" />
                      <span>Secure payment by Stripe</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Truck className="h-3 w-3 shrink-0" />
                      <span>Print orders are non-refundable once in production</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </form>
      </Form>
    </div>
  );
}
