import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AdminAuthProvider } from "./contexts/AdminAuthContext";
import Home from "./pages/Home";
import MenuPage from "./pages/MenuPage";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import SuperAdminDashboard from "./pages/SuperAdminDashboard";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      {/* Super Admin routes */}
      <Route path="/super-admin/login">
        <AdminLogin mode="superadmin" />
      </Route>
      <Route path="/super-admin" component={SuperAdminDashboard} />
      {/* Admin routes */}
      <Route path="/admin/:slug/login">
        {(params) => <AdminLogin mode="admin" />}
      </Route>
      <Route path="/admin/:slug" component={AdminDashboard} />
      {/* Public menu route — must be last dynamic route */}
      <Route path="/:slug" component={MenuPage} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <AdminAuthProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </AdminAuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
