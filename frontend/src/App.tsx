import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuth } from "@/store/auth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Landing } from "@/pages/Landing";
import { Login } from "@/pages/Login";
import { Onboarding } from "@/pages/Onboarding";
import { Dashboard } from "@/pages/Dashboard";
import { Project } from "@/pages/Project";
import { Analysis } from "@/pages/Analysis";
import { Live } from "@/pages/Live";
import { CommandCenter } from "@/pages/CommandCenter";
import { Presentation } from "@/pages/Presentation";
import { CommandPalette } from "@/components/CommandPalette";
import { NotFound } from "@/pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

export default function App() {
  const init = useAuth((s) => s.init);
  const user = useAuth((s) => s.user);

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <Landing />} />
          <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
          <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/projects/:projectId" element={<ProtectedRoute><Project /></ProtectedRoute>} />
          <Route path="/analysis/:videoId" element={<ProtectedRoute><Analysis /></ProtectedRoute>} />
          <Route path="/present/:videoId" element={<ProtectedRoute><Presentation /></ProtectedRoute>} />
          <Route path="/live" element={<ProtectedRoute><Live /></ProtectedRoute>} />
          <Route path="/command-center" element={<ProtectedRoute><CommandCenter /></ProtectedRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        {user && <CommandPalette />}
      </BrowserRouter>
    </QueryClientProvider>
  );
}
