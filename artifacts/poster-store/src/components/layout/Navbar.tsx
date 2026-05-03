import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { useStorefront } from "@/context/StorefrontContext";
import { ShoppingBag, Heart, Menu, X } from "lucide-react";
import { useGetCart, getGetCartQueryKey } from "@workspace/api-client-react";
import { getSessionId } from "@/lib/session";
import { Button } from "@/components/ui/button";

export const Navbar = () => {
  const store = useStorefront();
  const sessionId = getSessionId();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [location] = useLocation();

  const cartParams = { sessionId, storeKey: store.storeKey };

  const { data: cart } = useGetCart(cartParams, {
    query: {
      enabled: !!sessionId,
      queryKey: getGetCartQueryKey(cartParams),
    },
  });

  const itemCount = cart?.itemCount || 0;

  const closeMobile = () => setMobileOpen(false);

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2" data-testid="link-home" onClick={closeMobile}>
            <span className="font-serif text-2xl font-bold tracking-tight text-primary">
              {store.storeName}
            </span>
          </Link>
          <div className="hidden md:flex items-center gap-4">
            <Link href="/shop" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors" data-testid="link-shop">
              Shop
            </Link>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/favorites" data-testid="link-favorites">
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary">
              <Heart className="h-5 w-5" />
              <span className="sr-only">Favorites</span>
            </Button>
          </Link>
          <Link href="/cart" data-testid="link-cart">
            <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-primary">
              <ShoppingBag className="h-5 w-5" />
              {itemCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-secondary text-[10px] font-bold text-secondary-foreground">
                  {itemCount}
                </span>
              )}
              <span className="sr-only">Cart</span>
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            data-testid="btn-mobile-menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border/40 bg-background/95 backdrop-blur px-4 py-4 space-y-1">
          <Link
            href="/shop"
            onClick={closeMobile}
            data-testid="link-shop-mobile"
          >
            <div className={`flex items-center px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${location === "/shop" ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"}`}>
              Shop
            </div>
          </Link>
          <Link href="/favorites" onClick={closeMobile}>
            <div className={`flex items-center px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${location === "/favorites" ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"}`}>
              Saved Posters
            </div>
          </Link>
          <Link href="/cart" onClick={closeMobile}>
            <div className={`flex items-center justify-between px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${location === "/cart" ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"}`}>
              <span>Cart</span>
              {itemCount > 0 && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-[10px] font-bold text-secondary-foreground">
                  {itemCount}
                </span>
              )}
            </div>
          </Link>
        </div>
      )}
    </nav>
  );
};
