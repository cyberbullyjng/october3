import React, { useState } from "react";
import { useListServers } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Link } from "wouter";
import { 
  Search, 
  ChevronLeft, 
  ChevronRight,
  Server as ServerIcon,
  Users,
  ArrowDownUp
} from "lucide-react";

export default function Servers() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "memberCount" | "joinedAt">("memberCount");
  const [order, setOrder] = useState<"asc" | "desc">("desc");

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading } = useListServers({
    page,
    limit: 12,
    ...(debouncedSearch && { search: debouncedSearch }),
    sortBy,
    order,
  });

  const handleSort = (field: "name" | "memberCount" | "joinedAt") => {
    if (sortBy === field) {
      setOrder(order === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setOrder("desc");
    }
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Discord Servers</h1>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-border bg-muted/20 flex flex-col sm:flex-row justify-between gap-4">
          <div className="relative w-full sm:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Search by server name or ID..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-background border border-input rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          
          <div className="flex border border-border rounded-md overflow-hidden text-sm">
            <button
              onClick={() => handleSort("memberCount")}
              className={`px-3 py-2 flex items-center transition-colors ${sortBy === "memberCount" ? "bg-primary text-primary-foreground font-medium" : "bg-background hover:bg-muted"}`}
            >
              <Users className="w-4 h-4 mr-1.5" />
              Size
              {sortBy === "memberCount" && <ArrowDownUp className={`w-3 h-3 ml-1.5 ${order === "asc" ? "rotate-180" : ""}`} />}
            </button>
            <button
              onClick={() => handleSort("joinedAt")}
              className={`px-3 py-2 border-l border-border flex items-center transition-colors ${sortBy === "joinedAt" ? "bg-primary text-primary-foreground font-medium" : "bg-background hover:bg-muted"}`}
            >
              Join Date
              {sortBy === "joinedAt" && <ArrowDownUp className={`w-3 h-3 ml-1.5 ${order === "asc" ? "rotate-180" : ""}`} />}
            </button>
          </div>
        </div>

        {/* Grid */}
        <div className="p-6">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                <div key={i} className="border border-border rounded-lg p-4 animate-pulse">
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
              {data.data.map((server) => (
                <Link key={server.id} href={`/servers/${server.id}`}>
                  <div className="group border border-border rounded-lg p-5 hover:border-primary/50 hover:bg-muted/10 transition-all cursor-pointer bg-card h-full flex flex-col relative overflow-hidden">
                    
                    <div className="flex items-center mb-4 relative z-10">
                      {server.iconUrl ? (
                        <img 
                          src={server.iconUrl} 
                          alt={server.name} 
                          className="w-12 h-12 rounded-full mr-4 object-cover border border-border shadow-sm group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full mr-4 bg-primary/10 text-primary flex items-center justify-center font-bold text-lg border border-primary/20 group-hover:scale-105 transition-transform">
                          {server.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors" title={server.name}>
                          {server.name}
                        </h3>
                        <p className="text-xs text-muted-foreground font-mono truncate">{server.discordId}</p>
                      </div>
                    </div>
                    
                    <div className="mt-auto space-y-2 pt-4 border-t border-border relative z-10">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground flex items-center">
                          <Users className="w-4 h-4 mr-1.5" /> Members
                        </span>
                        <span className="font-medium">{server.memberCount.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground flex items-center">
                          <ServerIcon className="w-4 h-4 mr-1.5" /> Joined
                        </span>
                        <span>{format(new Date(server.joinedAt), "MMM d, yyyy")}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 border border-dashed border-border rounded-lg bg-muted/5">
              <ServerIcon className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-1">No servers found</h3>
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
              <span className="font-medium text-foreground">{data.total}</span> servers
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