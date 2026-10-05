import React from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

const ClientWelcome = React.lazy(() => import("./pages/ClientWelcome"));
const AdminLogin = React.lazy(() => import("./pages/AdminLogin"));
const Home = React.lazy(() => import("./pages/Home"));
const NotFound = React.lazy(() => import("./pages/NotFound"));

function RouteFallback() {
  return <main className="admin-auth-screen"><div className="admin-auth-loading">Loading GuestFlow…</div></main>;
}

function AdminGate() {
  const [status, setStatus] = React.useState<"loading" | "login" | "authenticated">("loading");

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    } finally {
      setStatus("login");
    }
  };

  React.useEffect(() => {
    fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => setStatus(payload.authenticated ? "authenticated" : "login"))
      .catch(() => setStatus("login"));
  }, []);

  if (status === "loading") return <main className="admin-auth-screen"><div className="admin-auth-loading">Checking admin access…</div></main>;
  if (status === "login") return <AdminLogin onAuthenticated={() => setStatus("authenticated")} />;
  return <Home onLogout={logout} />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={AdminGate} />
      <Route path="/welcome" component={ClientWelcome} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <React.Suspense fallback={<RouteFallback />}><Router /></React.Suspense>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
