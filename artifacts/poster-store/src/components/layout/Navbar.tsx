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

const NAV_LINKS = [
  { label: "Posters", href: "/shop" },
  { label: "Bestsellers", href: "/shop" },
  { label: "New Arrivals", href: "/shop?isNew=true" },
  { label: "Frames", href: "/shop" },
  { label: "Inspiration", href: "/shop" },
  { label: "Gift Cards", href: "/shop" },
];

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

  // Logo image error fallback
  const [logoImgError, setLogoImgError] = useState(false);

  // Keep input in sync when URL changes externally
  useEffect(() => {
    setSearchInputValue(currentSearch);
    if (currentSearch) setSearchOpen(true);
  }, [currentSearch]);

  // Reset logo error when store changes
  useEffect(() => {
    setLogoImgError(false);
  }, [store.logoUrl]);

  // Autofocus when search opens
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

  const openSearch = () => {
    setMobileOpen(false);
    setSearchOpen(true);
  };

  const showLogoImage = !!store.logoUrl && !logoImgError;

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div
          className="
            container mx-auto max-w-screen-2xl
            h-16 px-4 sm:px-6 lg:px-10
            flex items-center gap-2
            xl:grid xl:grid-cols-[1fr_auto_1fr] xl:gap-3
          "
        >

        {/* Logo — hidden on mobile when search is open to give input room */}
        <Link
          href="/"
          className={`
            items-center gap-2 shrink-0 justify-self-start
            ${searchOpen ? "hidden xl:flex" : "flex"}
          `}
          data-testid="link-home"
          onClick={closeMobile}
        >
          {showLogoImage ? (
            <img
              src={store.logoUrl!}
              alt={store.logoAltText || store.storeName}
              className="h-[30px] sm:h-[36px] w-auto max-w-[140px] sm:max-w-[180px] object-contain"
              onError={() => setLogoImgError(true)}
            />
          ) : (
            <span className="font-serif text-2xl font-bold tracking-tight text-primary">
              {store.storeName}
            </span>
          )}
        </Link>

        {/* Primary navigation — large desktop */}
        <div
          className="
            hidden xl:flex
            justify-self-center
            items-center justify-center
            gap-5 2xl:gap-7
          "
          aria-label="Primary navigation"
        >
          {NAV_LINKS.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="
                relative shrink-0 whitespace-nowrap
                text-sm font-medium
                text-foreground/90
                transition-colors duration-150
                hover:text-primary
                after:absolute after:-bottom-1.5
                after:left-0 after:h-px after:w-0
                after:bg-primary
                after:transition-all after:duration-200
                hover:after:w-full
              "
            >
              {item.label}
            </Link>
          ))}
        </div>      
        
          {/* Right-side utilities */}
              <div
                className={`
                  flex min-w-0 items-center justify-end gap-1 sm:gap-2
                  ${searchOpen ? "flex-1" : "ml-auto"}
                  xl:ml-0 xl:w-full xl:justify-self-end
                `}
              >

          {/* Search input — bounded to the right utility area */}
              {searchOpen && (
                <div
                  className="
                    relative min-w-0 flex-1
                    xl:flex-none
                    xl:w-[clamp(160px,14vw,240px)]
                  "
                >
                  <Search
                    className="
                      pointer-events-none
                      absolute left-3 top-1/2
                      h-4 w-4 -translate-y-1/2
                      text-muted-foreground
                    "
                  />

                  <Input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Search posters…"
                    value={searchInputValue}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="h-9 w-full min-w-0 bg-background/90 pl-9"
                    data-testid="input-search"
                    onKeyDown={(e) => {
                      if (e.key === "Escape") closeSearch();
                    }}
                  />
                </div>
              )}
              
          {/* Search toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-primary shrink-0"
            onClick={searchOpen ? closeSearch : openSearch}
            aria-label={searchOpen ? "Close search" : "Search posters"}
            aria-expanded={searchOpen}
            data-testid="btn-search-toggle"
          >
            {searchOpen ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
          </Button>

          {/* Favorites — hidden on mobile when search is open */}
          <Link
            href="/favorites"
            data-testid="link-favorites"
            className={searchOpen ? "hidden sm:block" : "block"}
          >
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary">
              <Heart className="h-5 w-5" />
              <span className="sr-only">Saved posters</span>
            </Button>
          </Link>

          {/* Cart */}
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

          {/* Account — desktop only */}
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-primary hidden md:flex"
                  data-testid="btn-account"
                >
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

          {/* Mobile hamburger — hidden when search open to avoid crowding */}
          {!searchOpen && (
            <Button
              variant="ghost"
              size="icon"
              className="xl:hidden"
              onClick={() => setMobileOpen((o) => !o)}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              data-testid="btn-mobile-menu"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          )}
        </div>
      </div>

      {/* Mobile menu drawer */}
      {mobileOpen && (
        <div className="xl:hidden border-t border-border/40 bg-background/95 backdrop-blur px-4 py-4 space-y-1"> 

          <div className="space-y-1 pb-3">
            {NAV_LINKS.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                onClick={closeMobile}
              >
                <div
                  className="
                    flex items-center
                    rounded-md px-3 py-2.5
                    text-sm font-medium
                    text-foreground
                    transition-colors
                    hover:bg-muted hover:text-primary
                  "
                >
                  {item.label}
                </div>
              </Link>
            ))}
          </div>

          <div className="my-2 border-t border-border/50" />
          
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
