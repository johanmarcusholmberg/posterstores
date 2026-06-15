import React from "react";
import { useGetCart, getGetCartQueryKey, useUpdateCartItem, useRemoveCartItem } from "@workspace/api-client-react";
import { getSessionId } from "@/lib/session";
import { useStorefront } from "@/context/StorefrontContext";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Trash2, Plus, Minus, ShoppingBag, ArrowRight, Shield, Truck } from "lucide-react";

function formatPrice(price: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-EU", { style: "currency", currency }).format(price);
  } catch {
    const symbols: Record<string, string> = { EUR: "€", SEK: "kr", USD: "$", GBP: "£" };
    const symbol = symbols[currency] ?? currency;
    if (currency === "SEK") return `${price.toFixed(0)} ${symbol}`;
    return `${symbol}${price.toFixed(2)}`;
  }
}

export default function Cart() {
  const sessionId = getSessionId();
  const store = useStorefront();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const cartParams = { sessionId, storeKey: store.storeKey };

  const { data: cart, isLoading } = useGetCart(cartParams, {
    query: {
      enabled: !!sessionId,
      queryKey: getGetCartQueryKey(cartParams),
    },
  });

  const updateCartItem = useUpdateCartItem();
  const removeCartItem = useRemoveCartItem();

  const handleUpdateQuantity = (cartItemId: number, newQuantity: number) => {
    if (newQuantity < 1) return;
    updateCartItem.mutate(
      { cartItemId, data: { quantity: newQuantity } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCartQueryKey(cartParams) });
        },
      }
    );
  };

  const handleRemove = (cartItemId: number) => {
    removeCartItem.mutate(
      { cartItemId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCartQueryKey(cartParams) });
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-24">
        <div className="max-w-5xl mx-auto space-y-4 animate-pulse">
          <div className="h-10 bg-muted rounded w-40" />
          <div className="h-32 bg-muted rounded" />
          <div className="h-32 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="container mx-auto px-4 py-32 text-center max-w-sm">
        <div className="bg-muted w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
          <ShoppingBag className="h-9 w-9 text-muted-foreground" />
        </div>
        <h1 className="font-serif text-3xl font-bold mb-3">Your cart is empty</h1>
        <p className="text-muted-foreground mb-8 text-sm leading-relaxed">
          You haven't added any posters yet. Browse the collection to find something you love.
        </p>
        <Link href="/shop">
          <Button size="lg" className="w-full">Browse posters</Button>
        </Link>
      </div>
    );
  }

  const cartCurrency = (cart as any).currency ?? store.defaultCurrency ?? "EUR";

  return (
    <div className="container mx-auto px-4 py-12 max-w-5xl">
      <h1 className="font-serif text-4xl font-bold mb-2">Your Cart</h1>
      <p className="text-muted-foreground mb-10 text-sm">{cart.itemCount} {cart.itemCount === 1 ? "item" : "items"}</p>

      <div className="flex flex-col lg:flex-row gap-10">
        {/* Cart Items */}
        <div className="flex-1 min-w-0">
          <div className="divide-y divide-border">
            {cart.items.map((item) => {
              const anyItem = item as any;
              const unitPrice = anyItem.unitPrice ?? item.poster?.price ?? 0;
              const itemCurrency = anyItem.currency ?? item.poster?.currency ?? cartCurrency;
              const sizeLabel = anyItem.size ?? item.size ?? null;
              const lineTotal = unitPrice * item.quantity;

              return (
                <div key={item.id} className="flex gap-4 py-6">
                  {/* Thumbnail */}
                  <Link href={`/poster/${item.posterId}`} className="shrink-0">
                    <div className="w-20 sm:w-28 aspect-[3/4] bg-muted rounded overflow-hidden">
                      {item.poster?.imageUrl ? (
                        <img
                          src={item.poster.imageUrl}
                          alt={item.poster?.title}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ShoppingBag className="h-6 w-6 text-muted-foreground/40" />
                        </div>
                      )}
                    </div>
                  </Link>

                  {/* Details */}
                  <div className="flex-1 flex flex-col min-w-0">
                    <div className="flex justify-between items-start gap-2 mb-1">
                      <div className="min-w-0">
                        <Link href={`/poster/${item.posterId}`}>
                          <h3 className="font-serif font-semibold text-base sm:text-lg leading-tight hover:text-primary transition-colors truncate">
                            {item.poster?.title}
                          </h3>
                        </Link>
                        {item.poster?.region && (
                          <p className="text-xs text-muted-foreground mt-0.5">{item.poster.region}</p>
                        )}
                        {sizeLabel && (
                          <p className="text-xs text-muted-foreground mt-1 bg-muted inline-block px-2 py-0.5 rounded" data-testid={`cart-size-${item.id}`}>
                            {sizeLabel}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-semibold text-sm">{formatPrice(lineTotal, itemCurrency)}</p>
                        {item.quantity > 1 && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {formatPrice(unitPrice, itemCurrency)} each
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-auto pt-3">
                      <div className="flex items-center border border-border rounded-md">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-none rounded-l-md"
                          onClick={() => handleUpdateQuantity(item.id, item.quantity - 1)}
                          disabled={item.quantity <= 1 || updateCartItem.isPending}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-9 text-center text-sm font-medium">{item.quantity}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-none rounded-r-md"
                          onClick={() => handleUpdateQuantity(item.id, item.quantity + 1)}
                          disabled={updateCartItem.isPending}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>

                      <button
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors"
                        onClick={() => handleRemove(item.id)}
                        disabled={removeCartItem.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 pt-6 border-t border-border flex items-center gap-4">
            <Link href="/shop">
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                ← Continue shopping
              </Button>
            </Link>
          </div>
        </div>

        {/* Order Summary */}
        <div className="w-full lg:w-72 xl:w-80 shrink-0">
          <div className="bg-muted/30 border border-border/60 rounded-xl p-6 sticky top-24">
            <h2 className="font-serif text-lg font-bold mb-5">Order Summary</h2>

            <div className="space-y-3 text-sm mb-5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal ({cart.itemCount} {cart.itemCount === 1 ? "item" : "items"})</span>
                <span className="font-medium">{formatPrice(cart.total, cartCurrency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shipping</span>
                <span className="text-muted-foreground italic">Calculated at checkout</span>
              </div>
            </div>

            <div className="border-t border-border pt-4 mb-5">
              <div className="flex justify-between items-baseline">
                <span className="font-semibold">Estimated total</span>
                <span className="text-xl font-bold">{formatPrice(cart.total, cartCurrency)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Taxes included where applicable</p>
            </div>

            <Button
              size="lg"
              className="w-full h-12 text-base font-semibold"
              onClick={() => setLocation("/checkout")}
            >
              Proceed to checkout <ArrowRight className="ml-2 h-4 w-4" />
            </Button>

            <div className="mt-5 space-y-2.5 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <Shield className="h-3.5 w-3.5 shrink-0" />
                <span>Secure payment via Stripe</span>
              </div>
              <div className="flex items-center gap-2">
                <Truck className="h-3.5 w-3.5 shrink-0" />
                <span>Shipping options shown at checkout</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
