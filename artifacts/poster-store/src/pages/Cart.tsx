import React from "react";
import { useGetCart, getGetCartQueryKey, useUpdateCartItem, useRemoveCartItem } from "@workspace/api-client-react";
import { getSessionId } from "@/lib/session";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Trash2, Plus, Minus, ShoppingBag, ArrowRight } from "lucide-react";

export default function Cart() {
  const sessionId = getSessionId();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const { data: cart, isLoading } = useGetCart({ sessionId }, {
    query: {
      enabled: !!sessionId,
      queryKey: getGetCartQueryKey({ sessionId })
    }
  });

  const updateCartItem = useUpdateCartItem();
  const removeCartItem = useRemoveCartItem();

  const handleUpdateQuantity = (cartItemId: number, newQuantity: number) => {
    if (newQuantity < 1) return;
    updateCartItem.mutate(
      { cartItemId, data: { quantity: newQuantity } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCartQueryKey({ sessionId }) });
        }
      }
    );
  };

  const handleRemove = (cartItemId: number) => {
    removeCartItem.mutate(
      { cartItemId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCartQueryKey({ sessionId }) });
        }
      }
    );
  };

  if (isLoading) {
    return <div className="container mx-auto px-4 py-24 text-center">Loading cart...</div>;
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="container mx-auto px-4 py-32 text-center max-w-md">
        <div className="bg-muted w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6">
          <ShoppingBag className="h-10 w-10 text-muted-foreground" />
        </div>
        <h1 className="font-serif text-3xl font-bold mb-4">Your cart is empty</h1>
        <p className="text-muted-foreground mb-8">
          Looks like you haven't added any posters to your cart yet. Discover our collection to find something you love.
        </p>
        <Link href="/shop">
          <Button size="lg" className="w-full">Explore posters</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-5xl">
      <h1 className="font-serif text-4xl font-bold mb-10">Your Cart</h1>

      <div className="flex flex-col lg:flex-row gap-12">
        <div className="flex-1">
          <div className="space-y-6">
            {cart.items.map((item) => (
              <div key={item.id} className="flex gap-6 py-6 border-b border-border">
                <Link href={`/poster/${item.posterId}`} className="shrink-0">
                  <div className="w-24 md:w-32 aspect-[3/4] bg-muted rounded overflow-hidden">
                    <img 
                      src={item.poster?.imageUrl} 
                      alt={item.poster?.title} 
                      className="w-full h-full object-cover"
                    />
                  </div>
                </Link>
                
                <div className="flex-1 flex flex-col">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <Link href={`/poster/${item.posterId}`}>
                        <h3 className="font-serif font-bold text-lg hover:text-primary transition-colors">
                          {item.poster?.title}
                        </h3>
                      </Link>
                      <p className="text-sm text-muted-foreground">{item.poster?.region}</p>
                      {item.size && <p className="text-sm text-muted-foreground mt-1">Size: {item.size}</p>}
                    </div>
                    <p className="font-medium">{item.poster?.price} {item.poster?.currency}</p>
                  </div>
                  
                  <div className="flex items-center justify-between mt-auto">
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
                      <span className="w-10 text-center text-sm font-medium">{item.quantity}</span>
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
                    
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleRemove(item.id)}
                      disabled={removeCartItem.isPending}
                    >
                      <Trash2 className="h-4 w-4 mr-2" /> Remove
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="w-full lg:w-80 shrink-0">
          <div className="bg-sand/30 p-6 rounded-lg sticky top-24">
            <h2 className="font-serif text-xl font-bold mb-6">Order Summary</h2>
            
            <div className="space-y-4 mb-6 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal ({cart.itemCount} items)</span>
                <span className="font-medium">{cart.total} {cart.items[0]?.poster?.currency || "EUR"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shipping</span>
                <span className="font-medium">Calculated at checkout</span>
              </div>
            </div>
            
            <div className="border-t border-border pt-4 mb-8">
              <div className="flex justify-between items-end">
                <span className="font-medium">Estimated Total</span>
                <span className="text-2xl font-bold">{cart.total} {cart.items[0]?.poster?.currency || "EUR"}</span>
              </div>
            </div>
            
            <Button 
              size="lg" 
              className="w-full h-14 text-lg"
              onClick={() => setLocation("/checkout")}
            >
              Checkout <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
