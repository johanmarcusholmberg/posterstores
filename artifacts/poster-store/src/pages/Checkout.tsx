import React from "react";
import { useGetCart, getGetCartQueryKey, useCreateOrder } from "@workspace/api-client-react";
import { getSessionId } from "@/lib/session";
import { useStorefront } from "@/context/StorefrontContext";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const checkoutSchema = z.object({
  customerName: z.string().min(2, "Name is required"),
  customerEmail: z.string().email("Valid email is required"),
  shippingAddress: z.string().min(10, "Full shipping address is required"),
});

export default function Checkout() {
  const sessionId = getSessionId();
  const store = useStorefront();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: cart, isLoading: cartLoading } = useGetCart({ sessionId }, {
    query: {
      enabled: !!sessionId,
      queryKey: getGetCartQueryKey({ sessionId })
    }
  });

  const createOrder = useCreateOrder();

  const form = useForm<z.infer<typeof checkoutSchema>>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      customerName: "",
      customerEmail: "",
      shippingAddress: "",
    },
  });

  const onSubmit = (values: z.infer<typeof checkoutSchema>) => {
    if (!cart || cart.items.length === 0) return;

    const items = cart.items.map(item => ({
      posterId: item.posterId,
      quantity: item.quantity,
      size: item.size,
      price: item.poster?.price || 0,
    }));

    createOrder.mutate(
      {
        data: {
          storeKey: store.storeKey,
          sessionId,
          customerName: values.customerName,
          customerEmail: values.customerEmail,
          shippingAddress: values.shippingAddress,
          items,
          total: cart.total,
          currency: cart.items[0]?.poster?.currency || store.defaultCurrency,
        }
      },
      {
        onSuccess: (order) => {
          queryClient.invalidateQueries({ queryKey: getGetCartQueryKey({ sessionId }) });
          toast({ title: "Order placed successfully!" });
          setLocation(`/order/${order.id}`);
        },
        onError: () => {
          toast({ variant: "destructive", title: "Failed to place order" });
        }
      }
    );
  };

  if (cartLoading) return <div className="p-24 text-center">Loading...</div>;

  if (!cart || cart.items.length === 0) {
    setLocation("/cart");
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-6xl">
      <h1 className="font-serif text-4xl font-bold mb-10">Checkout</h1>

      <div className="flex flex-col lg:flex-row gap-12">
        <div className="flex-1">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <div className="space-y-4">
                <h2 className="font-serif text-2xl font-bold border-b pb-2">Contact Information</h2>
                <FormField
                  control={form.control}
                  name="customerEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address</FormLabel>
                      <FormControl>
                        <Input placeholder="you@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-4">
                <h2 className="font-serif text-2xl font-bold border-b pb-2">Shipping Details</h2>
                <FormField
                  control={form.control}
                  name="customerName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Jane Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="shippingAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Address</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Street, City, Postal Code, Country" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Button type="submit" size="lg" className="w-full h-14 text-lg mt-8" disabled={createOrder.isPending}>
                {createOrder.isPending ? "Processing..." : `Pay ${cart.total} ${cart.items[0]?.poster?.currency || store.defaultCurrency}`}
              </Button>
            </form>
          </Form>
        </div>

        <div className="w-full lg:w-96 shrink-0">
          <div className="bg-sand/30 p-6 rounded-lg sticky top-24">
            <h2 className="font-serif text-xl font-bold mb-6">Order Summary</h2>
            <div className="space-y-4 mb-6">
              {cart.items.map((item) => (
                <div key={item.id} className="flex gap-4">
                  <div className="w-16 h-20 bg-muted rounded overflow-hidden shrink-0">
                    <img src={item.poster?.imageUrl} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 text-sm">
                    <p className="font-medium">{item.poster?.title}</p>
                    <p className="text-muted-foreground">Qty: {item.quantity}</p>
                    <p className="font-medium mt-1">{item.poster?.price} {item.poster?.currency}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-border pt-4 flex justify-between font-bold text-lg">
              <span>Total</span>
              <span>{cart.total} {cart.items[0]?.poster?.currency || store.defaultCurrency}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
