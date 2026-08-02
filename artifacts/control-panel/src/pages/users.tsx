import React, { useState } from "react";
import { useListUsers } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Link } from "wouter";
import { 
  Search, 
  ChevronLeft, 
  ChevronRight,
  User as UserIcon,
  Terminal,
  Activity
} from "lucide-react";

export default function Users() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading } = useListUsers({
    page,
    limit: 12,
    ...(debouncedSearch && { search: debouncedSearch }),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Discord Users</h1>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-border bg-muted/20">
          <div className="relative w-full sm:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Search by username or Discord ID..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-background border border-input rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {/* Grid */}
        <div className="p-6">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                <div key={i} className="border border-border rounded-lg p-4 animate-pulse bg-card">
                  <div className="flex items-center mb-4">
                    <div className="w-12 h-12 bg-muted rounded-full mr-4"></div>
                    <div className="space-y-2">
                      <div className="h-4 w-24 bg-muted rounded"></div>
                      <div className="h-3 w-16 bg-muted rounded"></div>
                    </div>
                  </div>
                  <div className="space-y-2 pt-4 border-t border-border">
                    <div className="h-3 w-full bg-muted rounded"></div>
                    <div className="h-3 w-2/3 bg-muted rounded"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : data?.data && data.data.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {data.data.map((user) => (
                <Link key={user.id} href={`/users/${user.id}`}>
                  <div className="group border border-border rounded-lg p-5 hover:border-primary/50 hover:bg-muted/10 transition-all cursor-pointer bg-card h-full flex flex-col relative overflow-hidden">
                    <div className="flex items-center mb-4 relative z-10">
                      {user.avatarUrl ? (
                        <img 
                          src={user.avatarUrl} 
                          alt={user.username} 
                          className="w-12 h-12 rounded-full mr-4 object-cover border border-border shadow-sm group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full mr-4 bg-primary/10 text-primary flex items-center justify-center font-bold text-lg border border-primary/20 group-hover:scale-105 transition-transform">
                          {user.username.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors" title={user.username}>
                          {user.username}
                        </h3>
                        <p className="text-xs text-muted-foreground font-mono truncate">{user.discordId}</p>
                      </div>
                    </div>
                    
                    <div className="mt-auto space-y-2 pt-4 border-t border-border relative z-10">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground flex items-center">
                          <Terminal className="w-4 h-4 mr-1.5" /> Commands
                        </span>
                        <span className="font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">{user.commandsUsed.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground flex items-center">
                          <Activity className="w-4 h-4 mr-1.5" /> Last Seen
                        </span>
                        <span>{format(new Date(user.lastSeen), "MMM d, yyyy")}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 border border-dashed border-border rounded-lg bg-muted/5">
              <UserIcon className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-1">No users found</h3>
              <p className="text-muted-foreground text-sm">Try adjusting your search filters.</p>
            </div>
          )}
        </div>

        {/* Pagination */}
        {data && data.total > 0 && (
          <div className="px-6 py-4 border-t border-border bg-muted/10 flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Showing <span className="font-medium text-foreground">{(page - 1) * 12 + 1}</span> to{' '}
              <span className="font-medium text-foreground">{Math.min(page * 12, data.total)}</span> of{' '}
              <span className="font-medium text-foreground">{data.total}</span> users
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 border border-border rounded-md hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page * 12 >= data.total}
                className="p-2 border border-border rounded-md hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}