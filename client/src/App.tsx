import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { UIThemeProvider } from "./contexts/UIThemeContext";
import { AdminAuthProvider } from "./contexts/AdminAuthContext";
import { AnimationProvider, useAnimationConfig } from "./contexts/AnimationContext";
import AnimatedBackground from "./components/AnimatedBackground";
import { SpeedInsights } from "@vercel/speed-insights/react";

const Home = lazy(() => import("./pages/Home"));
const MenuPage = lazy(() => import("./pages/MenuPage"));
const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const SuperAdminDashboard = lazy(() => import("./pages/SuperAdminDashboard"));
const Pricing = lazy(() => import("./pages/Pricing"));
const OrderStatusPage = lazy(() => import("./pages/OrderStatusPage"));
const StaffDashboard = lazy(() => import("./pages/StaffDashboard"));
const KitchenDisplay = lazy(() => import("./pages/KitchenDisplay"));
const RiderApp = lazy(() => import("./pages/RiderApp"));
const RestaurantLanding = lazy(() => import("./pages/RestaurantLanding"));

function RouteFallback() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: "#0a0a0a", color: "#F59E0B" }}
    >
      <div className="w-8 h-8 rounded-full border-2 border-current border-t-transparent animate-spin" />
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/pricing" component={Pricing} />
        {/* Super Admin routes */}
        <Route path="/super-admin/login">
          <AdminLogin mode="superadmin" />
        </Route>
        <Route path="/super-admin" component={SuperAdminDashboard} />
        {/* Admin routes */}
        <Route path="/admin/:slug/login" component={() => <AdminLogin mode="admin" />} />
        <Route path="/admin/:slug" component={AdminDashboard} />
        {/* Staff dashboard */}
        <Route path="/staff/:slug" component={StaffDashboard} />
        {/* Kitchen Display System */}
        <Route path="/kitchen/:slug" component={KitchenDisplay} />
        {/* Rider App — Fase 2 Delivery */}
        <Route path="/rider/:slug" component={RiderApp} />
        {/* Order tracking */}
        <Route path="/order-status/:orderId" component={OrderStatusPage} />
        {/* Restaurant landing page */}
        <Route path="/:slug/restaurante" component={RestaurantLanding} />
        {/* Public menu route — must be last dynamic route */}
        <Route path="/:slug" component={MenuPage} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

/**
 * Global background.
 * Reads restaurant colors from AnimationContext when available.
 * Kept intentionally lightweight so admin/menu stay smooth on desktop.
 */
function GlobalAnimatedBg() {
  const { config } = useAnimationConfig();
  return (
    <AnimatedBackground
      color1={config?.primaryColor}
    />
  );
}

function App() {
  return (
    <ErrorBoundary>
      <UIThemeProvider>
      <ThemeProvider defaultTheme="light">
        <AdminAuthProvider>
          <AnimationProvider>
            <TooltipProvider>
              <Toaster />
              <GlobalAnimatedBg />
              <Router />
              <SpeedInsights />
            </TooltipProvider>
          </AnimationProvider>
        </AdminAuthProvider>
      </ThemeProvider>
      </UIThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
