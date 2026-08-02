import React, { useState } from "react";
import { useListCommandLogs, useExportCommandLogs } from "@workspace/api-client-react";
import { format } from "date-fns";
import { 
  Search, 
  Download, 
  Filter, 
  ChevronLeft, 
  ChevronRight,
  CheckCircle2,
  XCircle,
  AlertCircle
} from "lucide-react";

export default function CommandLogs() {
  const [page, setPage] = useState(1);
  const [userId, setUserId] = useState("");
  const [serverId, setServerId] = useState("");
  const [command, setCommand] = useState("");
  const [status, setStatus] = useState<"success" | "failure" | "">("");

  // Create debounced values for search inputs to prevent rapid refetches
  const [debouncedUserId, setDebouncedUserId] = useState("");
  const [debouncedServerId, setDebouncedServerId] = useState("");
  const [debouncedCommand, setDebouncedCommand] = useState("");

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedUserId(userId);
      setDebouncedServerId(serverId);
      setDebouncedCommand(command);
      setPage(1); // Reset to page 1 on new search
    }, 500);
    return () => clearTimeout(timer);
  }, [userId, serverId, command]);

  const { data, isLoading } = useListCommandLogs({
    page,
    limit: 20,
    ...(debouncedUserId && { userId: debouncedUserId }),
    ...(debouncedServerId && { serverId: debouncedServerId }),
    ...(debouncedCommand && { command: debouncedCommand }),
    ...(status && { status }),
  });

  const handleExport = async () => {
    try {
      // In a real app we'd construct the URL and open it, or use the generated hook correctly
      // For now, we simulate triggering a download
      window.open(`/api/command-logs/export?userId=${debouncedUserId}&serverId=${debouncedServerId}&command=${debouncedCommand}`, '_blank');
    } catch (err) {
      console.error("Export failed", err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Command Logs</h1>
        <button 
          onClick={handleExport}
          className="flex items-center px-4 py-2 bg-secondary text-secondary-foreground rounded-md text-sm font-medium hover:bg-secondary/80 transition-colors"
        >
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </button>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        {/* Filters */}
        <div className="p-4 border-b border-border bg-muted/20 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Filter by User ID..." 
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-background border border-input rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Filter by Server ID..." 
              value={serverId}
              onChange={(e) => setServerId(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-background border border-input rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Command name..." 
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-background border border-input rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as any);
              setPage(1);
            }}
            className="w-full px-4 py-2 bg-background border border-input rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary appearance-none"
          >
            <option value="">All Statuses</option>
            <option value="success">Success</option>
            <option value="failure">Failure</option>
          </select>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground bg-muted/40 uppercase">
              <tr>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Command</th>
                <th className="px-6 py-4 font-medium">User</th>
                <th className="px-6 py-4 font-medium">Server</th>
                <th className="px-6 py-4 font-medium">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                    <div className="flex justify-center items-center">
                      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mr-3"></div>
                      Loading logs...
                    </div>
                  </td>
                </tr>
              ) : data?.data && data.data.length > 0 ? (
                data.data.map((log) => (
                  <React.Fragment key={log.id}>
                    <tr className="hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4">
                        {log.status === 'success' ? (
                          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-emerald-500/10 text-emerald-500">
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Success
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-destructive/10 text-destructive">
                            <XCircle className="w-3.5 h-3.5 mr-1" /> Failed
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono text-primary bg-primary/10 px-2 py-1 rounded">
                          /{log.command}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-foreground">{log.username}</div>
                        <div className="text-xs text-muted-foreground font-mono">{log.userId}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-foreground">{log.serverName}</div>
                        <div className="text-xs text-muted-foreground font-mono">{log.serverId}</div>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground whitespace-nowrap">
                        {format(new Date(log.timestamp), "MMM d, yyyy HH:mm:ss")}
                      </td>
                    </tr>
                    {log.status === 'failure' && log.errorMessage && (
                      <tr className="bg-destructive/5 border-t-0">
                        <td colSpan={5} className="px-6 py-3">
                          <div className="flex items-start text-xs text-destructive/80">
                            <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5" />
                            <span className="font-mono break-all">{log.errorMessage}</span>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                    No command logs found matching your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.total > 0 && (
          <div className="px-6 py-4 border-t border-border bg-muted/10 flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Showing <span className="font-medium text-foreground">{(page - 1) * 20 + 1}</span> to{' '}
              <span className="font-medium text-foreground">{Math.min(page * 20, data.total)}</span> of{' '}
              <span className="font-medium text-foreground">{data.total}</span> results
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
                disabled={page * 20 >= data.total}
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