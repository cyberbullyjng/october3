import React from "react";
import { useParams, Link } from "wouter";
import { useGetServer, useListCommandLogs } from "@workspace/api-client-react";
import { format } from "date-fns";
import { 
  ArrowLeft, 
  Server as ServerIcon, 
  Users, 
  Calendar,
  Activity,
  Terminal,
  ShieldBan
} from "lucide-react";

export default function ServerDetail() {
  const { id } = useParams<{ id: string }>();
  const serverId = parseInt(id || "0", 10);
  
  const { data: server, isLoading: isServerLoading } = useGetServer(serverId, {
    query: { enabled: !!serverId, queryKey: ['getServer', serverId] }
  });

  // Recent activity in this server
  const { data: logs, isLoading: isLogsLoading } = useListCommandLogs({
    serverId: server?.discordId,
    limit: 10,
    page: 1
  }, {
    query: { enabled: !!server?.discordId, queryKey: ['getLogs', server?.discordId] }
  });

  if (isServerLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!server) {
    return (
      <div className="text-center py-16">
        <h2 className="text-2xl font-bold text-foreground">Server Not Found</h2>
        <Link href="/servers" className="text-primary hover:underline mt-4 inline-block">
          Return to Servers List
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4 mb-8">
        <Link href="/servers" className="p-2 bg-muted hover:bg-muted/80 rounded-full transition-colors">
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </Link>
        <div className="flex items-center">
          {server.iconUrl ? (
            <img src={server.iconUrl} alt={server.name} className="w-12 h-12 rounded-full mr-4 shadow-sm border border-border" />
          ) : (
            <div className="w-12 h-12 rounded-full mr-4 bg-primary/10 text-primary flex items-center justify-center font-bold text-xl border border-primary/20">
              {server.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{server.name}</h1>
            <p className="text-sm text-muted-foreground font-mono">{server.discordId}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Info Sidebar */}
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-xl shadow-sm p-6">
            <h3 className="font-semibold text-lg mb-4 border-b border-border pb-2">Server Details</h3>
            
            <div className="space-y-4">
              <div className="flex items-start">
                <Users className="w-5 h-5 text-muted-foreground mr-3 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground">Member Count</p>
                  <p className="text-xl font-bold">{server.memberCount.toLocaleString()}</p>
                </div>
              </div>
              
              <div className="flex items-start">
                <Calendar className="w-5 h-5 text-muted-foreground mr-3 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground">Joined Network</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {format(new Date(server.joinedAt), "MMMM d, yyyy")}
                    <br/>
                    {format(new Date(server.joinedAt), "h:mm a")}
                  </p>
                </div>
              </div>

              <div className="flex items-start">
                <ServerIcon className="w-5 h-5 text-muted-foreground mr-3 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground">Internal ID</p>
                  <p className="text-sm font-mono text-muted-foreground mt-1">{server.id}</p>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-border">
              <Link 
                href="/blacklist/servers" 
                className="w-full flex items-center justify-center px-4 py-2 border border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground rounded-md transition-colors text-sm font-medium"
              >
                <ShieldBan className="w-4 h-4 mr-2" />
                Manage Restrictions
              </Link>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="md:col-span-2 space-y-6">
          <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-border flex justify-between items-center">
              <h3 className="font-semibold text-lg flex items-center">
                <Activity className="w-5 h-5 mr-2 text-primary" />
                Recent Server Activity
              </h3>
              <Link 
                href={`/command-logs?serverId=${server.discordId}`} 
                className="text-sm text-primary hover:underline"
              >
                View all history
              </Link>
            </div>
            
            <div className="divide-y divide-border">
              {isLogsLoading ? (
                <div className="p-8 text-center text-muted-foreground">Loading activity...</div>
              ) : logs?.data && logs.data.length > 0 ? (
                logs.data.map((log) => (
                  <div key={log.id} className="p-4 hover:bg-muted/30 transition-colors flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className={`p-2 rounded-md ${log.status === 'success' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-destructive/10 text-destructive'}`}>
                        <Terminal className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          <span className="font-mono text-primary bg-primary/10 px-1 rounded mr-1">/{log.command}</span>
                          used by {log.username}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date(log.timestamp), "MMM d, h:mm:ss a")}
                        </p>
                      </div>
                    </div>
                    <div className="text-xs font-medium">
                      {log.status === 'success' ? (
                        <span className="text-emerald-500">Success</span>
                      ) : (
                        <span className="text-destructive">Failed</span>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-muted-foreground border-t border-border/50">
                  No recent command activity recorded in this server.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}