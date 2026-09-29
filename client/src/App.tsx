import React from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import ClientWelcome from "./pages/ClientWelcome";
import AdminLogin from "./pages/AdminLogin";
import Home from "./pages/Home";

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
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
