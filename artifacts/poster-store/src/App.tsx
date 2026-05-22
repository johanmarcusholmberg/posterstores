import React, { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StorefrontProvider, useStorefront } from "@/context/StorefrontContext";
import { AdminTokenProvider } from "@/context/AdminTokenContext";
import { AuthProvider } from "@/context/AuthContext";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
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
import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminPosters from "@/pages/admin/AdminPosters";
import AdminPosterNew from "@/pages/admin/AdminPosterNew";
import AdminPosterEdit from "@/pages/admin/AdminPosterEdit";
import AdminMockups from "@/pages/admin/AdminMockups";
import AdminPosterMockups from "@/pages/admin/AdminPosterMockups";
import AdminOrders from "@/pages/admin/AdminOrders";
import AdminOrderDetail from "@/pages/admin/AdminOrderDetail";
import AdminFulfillment from "@/pages/admin/AdminFulfillment";
import AdminStores from "@/pages/admin/AdminStores";
import AdminStoreNew from "@/pages/admin/AdminStoreNew";
import AdminStoreEdit from "@/pages/admin/AdminStoreEdit";
import AdminLaunchChecklist from "@/pages/admin/AdminLaunchChecklist";
import AdminProductionSetup from "@/pages/admin/AdminProductionSetup";
import AdminContentPages from "@/pages/admin/AdminContentPages";
import AdminContentPageEdit from "@/pages/admin/AdminContentPageEdit";

const queryClient = new QueryClient();

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

function Router() {
  return (
    <Switch>
      {/* Admin routes — always unaffected by store prefix */}
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
      <Route path="/admin/content/:pageKey" component={AdminContentPageEdit} />
      <Route path="/admin/content" component={AdminContentPages} />
      <Route path="/admin/stores/new" component={AdminStoreNew} />
      <Route path="/admin/stores/:storeKey" component={AdminStoreEdit} />
      <Route path="/admin/stores" component={AdminStores} />
      <Route path="/admin" component={AdminDashboard} />

      {/* Public storefront — catch-all (handles both prefixed and unprefixed) */}
      <Route>
        <PublicStorefrontSection />
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
