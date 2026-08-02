import React from "react";
import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  TerminalSquare, 
  BarChart3, 
  Server as ServerIcon, 
  Users, 
  ShieldAlert,
  ShieldBan,
  Settings,
  LogOut,
  Bot
} from "lucide-react";
import { useGetBotStatus } from "@workspace/api-client-react";

interface LayoutProps {
  children: React.ReactNode;
}

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/command-logs", label: "Command Logs", icon: TerminalSquare },
  { href: "/stats", label: "Statistics", icon: BarChart3 },
  { href: "/servers", label: "Servers", icon: ServerIcon },
  { href: "/users", label: "Users", icon: Users },
  { href: "/blacklist/users", label: "User Blacklist", icon: ShieldAlert },
  { href: "/blacklist/servers", label: "Server Blacklist", icon: ShieldBan },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Layout({ children }: LayoutProps) {
  const [location, setLocation] = useLocation();
  const { data: botStatus } = useGetBotStatus();

  const handleLogout = () => {
    localStorage.removeItem("token");
    setLocation("/login");
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-border">
          <Bot className="w-6 h-6 text-primary mr-3" />
          <span className="font-bold text-lg tracking-tight">October</span>
        </div>
        
        <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            const Icon = item.icon;
            
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive 
                    ? "bg-primary/10 text-primary" 
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="w-5 h-5 mr-3 flex-shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border">
          <button 
            onClick={handleLogout}
            className="flex items-center w-full px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <LogOut className="w-5 h-5 mr-3 flex-shrink-0" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="h-16 border-b border-border bg-card flex items-center justify-between px-8">
          <h2 className="text-lg font-semibold text-foreground">
            {navItems.find(item => item.href === location)?.label || "Control Panel"}
          </h2>
          
          <div className="flex items-center space-x-6 text-sm">
            {botStatus ? (
              <>
                <div className="flex items-center text-muted-foreground">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 mr-2 shadow-[0_0_8px_rgba(16,185,129,0.6)]"></div>
                  Online
                </div>
                <div className="flex items-center text-muted-foreground">
                  <span className="mr-1">Latency:</span>
                  <span className="text-foreground font-mono">{botStatus.latency}ms</span>
                </div>
                <div className="flex items-center text-muted-foreground">
                  <span className="mr-1">Uptime:</span>
                  <span className="text-foreground font-mono">
                    {Math.floor(botStatus.uptime / 3600)}h {Math.floor((botStatus.uptime % 3600) / 60)}m
                  </span>
                </div>
              </>
            ) : (
              <div className="flex items-center text-muted-foreground">
                <div className="w-2 h-2 rounded-full bg-muted-foreground mr-2 animate-pulse"></div>
                Checking status...
              </div>
            )}
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 p-8 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}