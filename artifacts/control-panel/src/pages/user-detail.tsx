import React from "react";
import { useParams, Link } from "wouter";
import { useGetUser } from "@workspace/api-client-react";
import { format } from "date-fns";
import { 
  ArrowLeft, 
  User as UserIcon, 
  Activity,
  Terminal,
  ShieldAlert,
  Hash,
  Clock
} from "lucide-react";

export default function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const userId = id || "0";
  
  // Assuming the hook expects the ID directly
  // The backend might parse it correctly
  const { data: userDetail, isLoading } = useGetUser(userId as any, {
    query: { enabled: !!userId, queryKey: ['getUser', userId] }
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!userDetail || !userDetail.user) {
    return (
      <div className="text-center py-16">
        <h2 className="text-2xl font-bold text-foreground">User Not Found</h2>
        <Link href="/users" className="text-primary hover:underline mt-4 inline-block">
          Return to Users List
        </Link>
      </div>
    );
  }

  const { user, recentActivity } = userDetail;

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4 mb-8">
        <Link href="/users" className="p-2 bg-muted hover:bg-muted/80 rounded-full transition-colors">
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </Link>
        <div className="flex items-center">
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt={user.username} className="w-12 h-12 rounded-full mr-4 shadow-sm border border-border" />
          ) : (
            <div className="w-12 h-12 rounded-full mr-4 bg-primary/10 text-primary flex items-center justify-center font-bold text-xl border border-primary/20">
              {user.username.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{user.username}</h1>
            <p className="text-sm text-muted-foreground font-mono">{user.discordId}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Info Sidebar */}
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-xl shadow-sm p-6">
            <h3 className="font-semibold text-lg mb-4 border-b border-border pb-2">User Details</h3>
            
            <div className="space-y-4">
              <div className="flex items-start">
                <Terminal className="w-5 h-5 text-muted-foreground mr-3 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground">Commands Used</p>
                  <p className="text-xl font-bold text-primary">{user.commandsUsed.toLocaleString()}</p>
                </div>
              </div>
              
              <div className="flex items-start">
                <Clock className="w-5 h-5 text-muted-foreground mr-3 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground">Last Seen</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {format(new Date(user.lastSeen), "MMMM d, yyyy")}
                    <br/>
                    {format(new Date(user.lastSeen), "h:mm a")}
                  </p>
                </div>
              </div>

              <div className="flex items-start">
                <Hash className="w-5 h-5 text-muted-foreground mr-3 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground">Internal ID</p>
                  <p className="text-sm font-mono text-muted-foreground mt-1">{user.id}</p>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-border">
              <Link 
                href="/blacklist/users" 
                className="w-full flex items-center justify-center px-4 py-2 border border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground rounded-md transition-colors text-sm font-medium"
              >
                <ShieldAlert className="w-4 h-4 mr-2" />
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
                Recent Command Activity
              </h3>
              <Link 
                href={`/command-logs?userId=${user.discordId}`} 
                className="text-sm text-primary hover:underline"
              >
                View all history
              </Link>
            </div>
            
            <div className="divide-y divide-border">
              {recentActivity && recentActivity.length > 0 ? (
                recentActivity.map((log) => (
                  <div key={log.id} className="p-4 hover:bg-muted/30 transition-colors flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className={`p-2 rounded-md ${log.status === 'success' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-destructive/10 text-destructive'}`}>
                        <Terminal className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          <span className="font-mono text-primary bg-primary/10 px-1 rounded mr-1">/{log.command}</span>
                          in {log.serverName}
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
                  No recent command activity recorded for this user.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}