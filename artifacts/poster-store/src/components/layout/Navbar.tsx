import React, { useState, useRef, useEffect } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useStorefront } from "@/context/StorefrontContext";
import { useAuth } from "@/context/AuthContext";
import { ShoppingBag, Heart, Menu, X, User, LogOut, LayoutDashboard, Search } from "lucide-react";
import { useGetCart, getGetCartQueryKey } from "@workspace/api-client-react";
import { getSessionId } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Navbar = () => {
  const store = useStorefront();
  const { user, logout } = useAuth();
  const sessionId = getSessionId();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [location, setLocation] = useLocation();
  const searchString = useSearch();

  const cartParams = { sessionId, storeKey: store.storeKey };

  const { data: cart } = useGetCart(cartParams, {
    query: {
      enabled: !!sessionId,
      queryKey: getGetCartQueryKey(cartParams),
    },
  });

  const itemCount = cart?.itemCount || 0;
  const closeMobile = () => setMobileOpen(false);

  const handleLogout = async () => {
    await logout();
    closeMobile();
  };

  // Search state
  const searchParams = new URLSearchParams(searchString);
  const currentSearch = searchParams.get("search") || "";
  const [searchOpen, setSearchOpen] = useState(!!currentSearch);
  const [searchInputValue, setSearchInputValue] = useState(currentSearch);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Keep input in sync when URL changes externally
  useEffect(() => {
    setSearchInputValue(currentSearch);
    if (currentSearch) setSearchOpen(true);
  }, [currentSearch]);

  // Focus input when search row opens
  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [searchOpen]);

  const handleSearchChange = (value: string) => {
    setSearchInputValue(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchString);
      if (value) {
        params.set("search", value);
      } else {
        params.delete("search");
      }
      setLocation(`/shop?${params.toString()}`);
    }, 300);
  };

  const closeSearch = () => {
    // Only collapse if no active query
    setSearchInputValue("");
    setSearchOpen(false);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    const params = new URLSearchParams(searchString);
    params.delete("search");
    const qs = params.toString();
    if (location.startsWith("/shop")) {
      setLocation(qs ? `/shop?${qs}` : "/shop");
    }
  };

  const toggleSearch = () => {
    if (searchOpen && !currentSearch) {
      closeSearch();
    } else {
      setSearchOpen((o) => !o);
    }
  };

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2" data-testid="link-home" onClick={closeMobile}>
            <span className="font-serif text-2xl font-bold tracking-tight text-primary">
              {store.storeName}
            </span>
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-primary"
            onClick={toggleSearch}
            aria-label={searchOpen ? "Close search" : "Open search"}
            aria-expanded={searchOpen}
            data-testid="btn-search-toggle"
          >
            {searchOpen ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
          </Button>

          <Link href="/favorites" data-testid="link-favorites">
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary">
              <Heart className="h-5 w-5" />
              <span className="sr-only">Saved posters</span>
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

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary hidden md:flex" data-testid="btn-account">
                  <User className="h-5 w-5" />
                  <span className="sr-only">Account</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <div className="px-2 py-1.5 text-xs text-muted-foreground truncate">{user.email}</div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/favorites" className="cursor-pointer">
                    <Heart className="mr-2 h-4 w-4" /> Saved posters
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/account" className="cursor-pointer">
                    <User className="mr-2 h-4 w-4" /> Account
                  </Link>
                </DropdownMenuItem>
                {user.isAdmin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/admin" className="cursor-pointer">
                        <LayoutDashboard className="mr-2 h-4 w-4" /> Administration
                      </Link>
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-muted-foreground">
                  <LogOut className="mr-2 h-4 w-4" /> Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link href="/login" className="hidden md:block" data-testid="link-login">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary">
                Log in
              </Button>
            </Link>
          )}

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

      {/* Expandable search row */}
      <div
        className={`overflow-hidden transition-all duration-200 ease-in-out ${searchOpen ? "max-h-20 opacity-100" : "max-h-0 opacity-0"}`}
        aria-hidden={!searchOpen}
      >
        <div className="border-t border-border/40 bg-background/95 backdrop-blur px-4 py-3">
          <div className="container mx-auto relative max-w-2xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              ref={searchInputRef}
              type="text"
              placeholder="Search posters…"
              value={searchInputValue}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9 pr-9"
              data-testid="input-search"
              tabIndex={searchOpen ? 0 : -1}
              onKeyDown={(e) => {
                if (e.key === "Escape") closeSearch();
              }}
            />
            {searchInputValue && (
              <button
                onClick={closeSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Clear search"
                data-testid="btn-clear-search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-border/40 bg-background/95 backdrop-blur px-4 py-4 space-y-1">
          <Link href="/shop" onClick={closeMobile} data-testid="link-shop-mobile">
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
          {user ? (
            <>
              <Link href="/account" onClick={closeMobile}>
                <div className={`flex items-center px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${location === "/account" ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"}`}>
                  Account
                </div>
              </Link>
              {user.isAdmin && (
                <Link href="/admin" onClick={closeMobile}>
                  <div className={`flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${location.startsWith("/admin") ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"}`}>
                    <LayoutDashboard className="h-4 w-4" /> Administration
                  </div>
                </Link>
              )}
              <button onClick={handleLogout} className="w-full text-left">
                <div className="flex items-center px-3 py-2.5 rounded-md text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
                  Log out
                </div>
              </button>
            </>
          ) : (
            <>
              <Link href="/login" onClick={closeMobile}>
                <div className={`flex items-center px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${location === "/login" ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"}`}>
                  Log in
                </div>
              </Link>
              <Link href="/register" onClick={closeMobile}>
                <div className={`flex items-center px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${location === "/register" ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"}`}>
                  Create account
                </div>
              </Link>
            </>
          )}
        </div>
      )}
    </nav>
  );
};
