import React from "react";
import { useGetDashboardSummary, useGetLiveFeed } from "@workspace/api-client-react";
import { 
  Server, 
  Users, 
  Terminal, 
  Activity, 
  ShieldAlert, 
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Link } from "wouter";

export default function Dashboard() {
  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary();
  const { data: feed, isLoading: isLoadingFeed } = useGetLiveFeed({ limit: 10 });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard 
          title="Total Servers" 
          value={summary?.totalServers.toLocaleString() ?? "-"} 
          icon={Server} 
          isLoading={isLoadingSummary}
          href="/servers"
        />
        <StatCard 
          title="Total Users" 
          value={summary?.totalUsers.toLocaleString() ?? "-"} 
          icon={Users} 
          isLoading={isLoadingSummary}
          href="/users"
        />
        <StatCard 
          title="Commands Today" 
          value={summary?.commandsToday.toLocaleString() ?? "-"} 
          icon={Terminal} 
          isLoading={isLoadingSummary}
          href="/command-logs"
        />
        <StatCard 
          title="Active Blacklists" 
          value={((summary?.blacklistedUsers ?? 0) + (summary?.blacklistedServers ?? 0)).toString()} 
          icon={ShieldAlert} 
          isLoading={isLoadingSummary}
          href="/blacklist/users"
          variant="destructive"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-border flex justify-between items-center">
              <h3 className="font-semibold text-lg flex items-center">
                <Activity className="w-5 h-5 mr-2 text-primary" />
                Live Command Feed
              </h3>
              <Link href="/command-logs" className="text-sm text-primary hover:underline">
                View all logs
              </Link>
            </div>
            
            <div className="divide-y divide-border">
              {isLoadingFeed ? (
                <div className="p-8 text-center text-muted-foreground flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin mr-3"></div>
                  Loading feed...
                </div>
              ) : feed && feed.length > 0 ? (
                feed.map((log) => (
                  <div key={log.id} className="p-4 hover:bg-muted/50 transition-colors flex items-start space-x-4">
                    <div className="mt-1 flex-shrink-0">
                      {log.status === 'success' ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      ) : (
                        <XCircle className="w-5 h-5 text-destructive" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        <span className="text-primary font-mono bg-primary/10 px-1.5 py-0.5 rounded mr-2">/{log.command}</span>
                        used by <span className="font-semibold">{log.username}</span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        in {log.serverName} • {log.serverId}
                      </p>
                      {log.status === 'failure' && log.errorMessage && (
                        <div className="mt-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded p-2 flex items-start">
                          <AlertCircle className="w-3.5 h-3.5 mr-1.5 flex-shrink-0 mt-0.5" />
                          <span className="font-mono">{log.errorMessage}</span>
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground flex-shrink-0 whitespace-nowrap">
                      {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-muted-foreground">
                  No recent command activity.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-border">
              <h3 className="font-semibold text-lg flex items-center">
                <Clock className="w-5 h-5 mr-2 text-primary" />
                System Health
              </h3>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-muted-foreground">Bot Latency</span>
                  <span className="font-mono font-medium">{summary?.latency ?? 0}ms</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 transition-all duration-1000" 
                    style={{ width: `${Math.min(100, Math.max(5, 100 - ((summary?.latency ?? 0) / 10)))}%` }}
                  ></div>
                </div>
              </div>
              
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-muted-foreground">API Status</span>
                  <span className="text-emerald-500 font-medium">Operational</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full w-full bg-emerald-500"></div>
                </div>
              </div>

              <div className="pt-4 border-t border-border flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Commands This Week</span>
                <span className="font-mono font-bold text-lg">{summary?.commandsThisWeek.toLocaleString() ?? "-"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, isLoading, href, variant = "default" }: any) {
  const isDestructive = variant === "destructive";
  
  const content = (
    <div className={`bg-card border ${isDestructive ? 'border-destructive/30' : 'border-border'} rounded-xl p-6 shadow-sm hover:shadow-md transition-all`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-1">{title}</p>
          {isLoading ? (
            <div className="h-8 w-24 bg-muted animate-pulse rounded mt-1"></div>
          ) : (
            <h3 className={`text-3xl font-bold tracking-tight ${isDestructive ? 'text-destructive' : 'text-foreground'}`}>
              {value}
            </h3>
          )}
        </div>
        <div className={`p-3 rounded-lg ${isDestructive ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );

  return href ? <Link href={href} className="block hover:-translate-y-0.5 transition-transform">{content}</Link> : content;
}