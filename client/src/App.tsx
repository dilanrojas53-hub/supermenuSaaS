import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AdminAuthProvider } from "./contexts/AdminAuthContext";
import { AnimationProvider, useAnimationConfig } from "./contexts/AnimationContext";
import AnimatedBackground from "./components/AnimatedBackground";
import Home from "./pages/Home";
import MenuPage from "./pages/MenuPage";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import SuperAdminDashboard from "./pages/SuperAdminDashboard";
import Pricing from "./pages/Pricing";
import OrderStatusPage from "./pages/OrderStatusPage";

function Router() {
  return (
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
      {/* Order tracking */}
      <Route path="/order-status/:orderId" component={OrderStatusPage} />
      {/* Public menu route — must be last dynamic route */}
      <Route path="/:slug" component={MenuPage} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
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
      <ThemeProvider defaultTheme="light">
        <AdminAuthProvider>
          <AnimationProvider>
            <TooltipProvider>
              <Toaster />
              <GlobalAnimatedBg />
              <Router />
            </TooltipProvider>
          </AnimationProvider>
        </AdminAuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
