import React from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StorefrontProvider } from "@/context/StorefrontContext";
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

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/admin/posters/new" component={AdminPosterNew} />
      <Route path="/admin/posters/:id/mockups" component={AdminPosterMockups} />
      <Route path="/admin/posters/:id" component={AdminPosterEdit} />
      <Route path="/admin/posters" component={AdminPosters} />
      <Route path="/admin/mockups" component={AdminMockups} />
      <Route path="/admin/orders/:id" component={AdminOrderDetail} />
      <Route path="/admin/orders" component={AdminOrders} />
      <Route path="/admin/fulfillment" component={AdminFulfillment} />
      <Route path="/admin/stores/new" component={AdminStoreNew} />
      <Route path="/admin/stores/:storeKey" component={AdminStoreEdit} />
      <Route path="/admin/stores" component={AdminStores} />
      <Route path="/admin" component={AdminDashboard} />

      <Route>
        <div className="flex flex-col min-h-screen">
          <Navbar />
          <main className="flex-1">
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
              <Route component={NotFound} />
            </Switch>
          </main>
          <Footer />
        </div>
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
