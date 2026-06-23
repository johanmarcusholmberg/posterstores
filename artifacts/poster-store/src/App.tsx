import React, { useEffect, Suspense } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StorefrontProvider, useStorefront } from "@/context/StorefrontContext";
import { AdminTokenProvider } from "@/context/AdminTokenContext";
import { AuthProvider } from "@/context/AuthContext";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { StoreThemeApplicator } from "@/components/StoreThemeApplicator";

// ── Public pages — statically imported so the storefront is never gated ──
import Home from "@/pages/Home";
import Shop from "@/pages/Shop";
import PosterDetail from "@/pages/PosterDetail";
import PosterBySlug from "@/pages/PosterBySlug";
import Cart from "@/pages/Cart";
import Checkout from "@/pages/Checkout";
import OrderConfirmation from "@/pages/OrderConfirmation";
import Favorites from "@/pages/Favorites";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Account from "@/pages/Account";
import Shipping from "@/pages/Shipping";
import Returns from "@/pages/Returns";
import Privacy from "@/pages/Privacy";
import Terms from "@/pages/Terms";
import Contact from "@/pages/Contact";
import About from "@/pages/About";
import NotFound from "@/pages/not-found";

// ── Admin pages — lazily imported so they are split into separate chunks ──
// None of these modules are loaded until a visitor navigates to /admin/*.
const AdminDashboard = React.lazy(() => import("@/pages/admin/AdminDashboard"));
const AdminPosters = React.lazy(() => import("@/pages/admin/AdminPosters"));
const AdminPosterNew = React.lazy(() => import("@/pages/admin/AdminPosterNew"));
const AdminPosterEdit = React.lazy(() => import("@/pages/admin/AdminPosterEdit"));
const AdminMockups = React.lazy(() => import("@/pages/admin/AdminMockups"));
const AdminPosterMockups = React.lazy(() => import("@/pages/admin/AdminPosterMockups"));
const AdminOrders = React.lazy(() => import("@/pages/admin/AdminOrders"));
const AdminOrderDetail = React.lazy(() => import("@/pages/admin/AdminOrderDetail"));
const AdminFulfillment = React.lazy(() => import("@/pages/admin/AdminFulfillment"));
const AdminStores = React.lazy(() => import("@/pages/admin/AdminStores"));
const AdminStoreNew = React.lazy(() => import("@/pages/admin/AdminStoreNew"));
const AdminStoreEdit = React.lazy(() => import("@/pages/admin/AdminStoreEdit"));
const AdminLaunchChecklist = React.lazy(() => import("@/pages/admin/AdminLaunchChecklist"));
const AdminProductionSetup = React.lazy(() => import("@/pages/admin/AdminProductionSetup"));
const AdminContentPages = React.lazy(() => import("@/pages/admin/AdminContentPages"));
const AdminContentPageEdit = React.lazy(() => import("@/pages/admin/AdminContentPageEdit"));
const AdminHomepageEditor = React.lazy(() => import("@/pages/admin/AdminHomepageEditor"));

const queryClient = new QueryClient();

/** Neutral loading state shown while an admin chunk is being fetched. */
function AdminLoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <svg
          className="animate-spin h-6 w-6"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
        <span className="text-sm">Loading…</span>
      </div>
    </div>
  );
}

function ScrollToTop() {
  const [location] = useLocation();
  const pathname = location.split("?")[0];
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/** Public storefront pages — shared between prefixed and unprefixed routes. */
function PublicRoutes() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/shop" component={Shop} />
      <Route path="/posters/:slug" component={PosterBySlug} />
      <Route path="/poster/:id" component={PosterDetail} />
      <Route path="/cart" component={Cart} />
      <Route path="/checkout" component={Checkout} />
      <Route path="/order/:id" component={OrderConfirmation} />
      <Route path="/favorites" component={Favorites} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/account" component={Account} />
      <Route path="/shipping" component={Shipping} />
      <Route path="/returns" component={Returns} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/terms" component={Terms} />
      <Route path="/contact" component={Contact} />
      <Route path="/about" component={About} />
      <Route component={NotFound} />
    </Switch>
  );
}

/**
 * Wraps the public storefront in Navbar/Footer.
 * If a route prefix was resolved (e.g. "spain"), it mounts a nested
 * WouterRouter so that existing routes (/shop, /posters/:slug, …) work
 * unchanged under /spain/shop, /spain/posters/:slug, etc.
 */
function PublicStorefrontSection() {
  const { resolvedRoutePrefix } = useStorefront();

  const shell = (inner: React.ReactNode) => (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-1">{inner}</main>
      <Footer />
    </div>
  );

  if (resolvedRoutePrefix) {
    return shell(
      <WouterRouter base={`/${resolvedRoutePrefix}`}>
        <PublicRoutes />
      </WouterRouter>
    );
  }

  return shell(<PublicRoutes />);
}

/** Applies per-store CSS variables to a wrapper div so they never bleed into admin. */
function StoreThemeRoot({ children }: { children: React.ReactNode }) {
  return (
    <div id="store-theme-root">
      <StoreThemeApplicator />
      {children}
    </div>
  );
}

/**
 * All admin routes in a single Switch, wrapped in a single Suspense boundary.
 * Rendered only when the URL starts with /admin — lazy chunks are fetched
 * on first admin navigation and cached for subsequent visits.
 */
function AdminRoutes() {
  return (
    <Suspense fallback={<AdminLoadingFallback />}>
      <Switch>
        <Route path="/admin/posters/new" component={AdminPosterNew} />
        <Route path="/admin/posters/:id/mockups" component={AdminPosterMockups} />
        <Route path="/admin/posters/:id" component={AdminPosterEdit} />
        <Route path="/admin/posters" component={AdminPosters} />
        <Route path="/admin/mockups" component={AdminMockups} />
        <Route path="/admin/orders/:id" component={AdminOrderDetail} />
        <Route path="/admin/orders" component={AdminOrders} />
        <Route path="/admin/fulfillment" component={AdminFulfillment} />
        <Route path="/admin/launch-checklist" component={AdminLaunchChecklist} />
        <Route path="/admin/production-setup" component={AdminProductionSetup} />
        <Route path="/admin/homepage" component={AdminHomepageEditor} />
        <Route path="/admin/content/:pageKey" component={AdminContentPageEdit} />
        <Route path="/admin/content" component={AdminContentPages} />
        <Route path="/admin/stores/new" component={AdminStoreNew} />
        <Route path="/admin/stores/:storeKey" component={AdminStoreEdit} />
        <Route path="/admin/stores" component={AdminStores} />
        <Route path="/admin" component={AdminDashboard} />
      </Switch>
    </Suspense>
  );
}

function Router() {
  return (
    <Switch>
      {/*
       * Admin routes — a single regex catches /admin and any /admin/…
       * sub-path including multi-segment paths like /admin/posters/5.
       * Using a regex because wouter v3's :param+ does not span slashes.
       */}
      <Route path={/^\/admin(\/.*)?$/} component={AdminRoutes} />

      {/* Public storefront — catch-all (handles both prefixed and unprefixed) */}
      <Route>
        <StoreThemeRoot>
          <PublicStorefrontSection />
        </StoreThemeRoot>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <StorefrontProvider>
        <AuthProvider>
          <AdminTokenProvider>
            <TooltipProvider>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                <ScrollToTop />
                <Router />
              </WouterRouter>
              <Toaster />
            </TooltipProvider>
          </AdminTokenProvider>
        </AuthProvider>
      </StorefrontProvider>
    </QueryClientProvider>
  );
}

export default App;
