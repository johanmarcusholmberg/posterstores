import React from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StorefrontProvider } from "@/context/StorefrontContext";
import { AdminTokenProvider } from "@/context/AdminTokenContext";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import Home from "@/pages/Home";
import Shop from "@/pages/Shop";
import PosterDetail from "@/pages/PosterDetail";
import Cart from "@/pages/Cart";
import Checkout from "@/pages/Checkout";
import OrderConfirmation from "@/pages/OrderConfirmation";
import Favorites from "@/pages/Favorites";
import NotFound from "@/pages/not-found";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminPosters from "@/pages/admin/AdminPosters";
import AdminPosterNew from "@/pages/admin/AdminPosterNew";
import AdminPosterEdit from "@/pages/admin/AdminPosterEdit";

const queryClient = new QueryClient();

function StorefrontRouter() {
  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-1">
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/shop" component={Shop} />
          <Route path="/poster/:id" component={PosterDetail} />
          <Route path="/cart" component={Cart} />
          <Route path="/checkout" component={Checkout} />
          <Route path="/order/:id" component={OrderConfirmation} />
          <Route path="/favorites" component={Favorites} />
          <Route component={NotFound} />
        </Switch>
      </main>
      <Footer />
    </div>
  );
}

function AdminRouter() {
  return (
    <Switch>
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/admin/posters/new" component={AdminPosterNew} />
      <Route path="/admin/posters/:id" component={AdminPosterEdit} />
      <Route path="/admin/posters" component={AdminPosters} />
      <Route component={NotFound} />
    </Switch>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/admin" component={AdminRouter} />
      <Route path="/admin/:rest*" component={AdminRouter} />
      <Route component={StorefrontRouter} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <StorefrontProvider>
        <AdminTokenProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </AdminTokenProvider>
      </StorefrontProvider>
    </QueryClientProvider>
  );
}

export default App;
