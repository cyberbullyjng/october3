import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { setAuthTokenGetter } from '@workspace/api-client-react';

import Layout from './components/layout';
import Login from './pages/login';
import Dashboard from './pages/dashboard';
import CommandLogs from './pages/command-logs';
import Stats from './pages/stats';
import Servers from './pages/servers';
import ServerDetail from './pages/server-detail';
import Users from './pages/users';
import UserDetail from './pages/user-detail';
import BlacklistUsers from './pages/blacklist-users';
import BlacklistServers from './pages/blacklist-servers';
import Settings from './pages/settings';
import NotFound from './pages/not-found';
import { useEffect } from 'react';

setAuthTokenGetter(() => localStorage.getItem('token'));

const queryClient = new QueryClient();

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const [location, setLocation] = useLocation();
  const token = localStorage.getItem('token');

  useEffect(() => {
    if (!token) {
      setLocation('/login');
    }
  }, [token, setLocation]);

  if (!token) return null;

  return (
    <Layout>
      <Component />
    </Layout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/" component={() => <ProtectedRoute component={Dashboard} />} />
      <Route path="/command-logs" component={() => <ProtectedRoute component={CommandLogs} />} />
      <Route path="/stats" component={() => <ProtectedRoute component={Stats} />} />
      <Route path="/servers" component={() => <ProtectedRoute component={Servers} />} />
      <Route path="/servers/:id" component={() => <ProtectedRoute component={ServerDetail} />} />
      <Route path="/users" component={() => <ProtectedRoute component={Users} />} />
      <Route path="/users/:id" component={() => <ProtectedRoute component={UserDetail} />} />
      <Route path="/blacklist/users" component={() => <ProtectedRoute component={BlacklistUsers} />} />
      <Route path="/blacklist/servers" component={() => <ProtectedRoute component={BlacklistServers} />} />
      <Route path="/settings" component={() => <ProtectedRoute component={Settings} />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;