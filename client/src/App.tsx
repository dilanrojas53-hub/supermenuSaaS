import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { UIThemeProvider } from "./contexts/UIThemeContext";
import { AdminAuthProvider } from "./contexts/AdminAuthContext";
import { AnimationProvider, useAnimationConfig } from "./contexts/AnimationContext";
import AnimatedBackground from "./components/AnimatedBackground";
import { SpeedInsights } from "@vercel/speed-insights/react";

// Páginas críticas — carga inmediata (pequeñas o necesarias en primera visita)
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";

// Páginas pesadas — lazy loading (cada una genera su propio chunk)
const MenuPage           = lazy(() => import("./pages/MenuPage"));
const AdminLogin         = lazy(() => import("./pages/AdminLogin"));
const AdminDashboard     = lazy(() => import("./pages/AdminDashboard"));
const SuperAdminDashboard = lazy(() => import("./pages/SuperAdminDashboard"));
const Pricing            = lazy(() => import("./pages/Pricing"));
const OrderStatusPage    = lazy(() => import("./pages/OrderStatusPage"));
const StaffDashboard     = lazy(() => import("./pages/StaffDashboard"));
const KitchenDisplay     = lazy(() => import("./pages/KitchenDisplay"));
const RiderApp           = lazy(() => import("./pages/RiderApp"));
const RestaurantLanding  = lazy(() => import("./pages/RestaurantLanding"));

// Spinner mínimo para Suspense fallback — sin dependencias externas
function PageSpinner() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'var(--menu-bg, #0a0a0a)',
    }}>
      <div style={{
        width: 32,
        height: 32,
        border: '3px solid rgba(255,255,255,0.15)',
        borderTopColor: 'var(--menu-accent, #F97316)',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<PageSpinner />}>
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
 * Global animated background — ALWAYS renders.
 * Reads restaurant colors from AnimationContext when available.
 * Falls back to warm amber tones when no restaurant is loaded.
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
