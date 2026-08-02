import React, { useState } from "react";
import { 
  useListBlacklistedUsers, 
  useBlacklistUser, 
  useUpdateBlacklistedUser, 
  useUnblacklistUser 
} from "@workspace/api-client-react";
import { format } from "date-fns";
import { 
  Search, 
  ChevronLeft, 
  ChevronRight,
  ShieldAlert,
  Plus,
  Trash2,
  Edit2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export default function BlacklistUsers() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);

  // Form state
  const [discordId, setDiscordId] = useState("");
  const [username, setUsername] = useState("");
  const [reason, setReason] = useState("");

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading } = useListBlacklistedUsers({
    page,
    limit: 20,
    ...(debouncedSearch && { search: debouncedSearch }),
  });

  const addMutation = useBlacklistUser();
  const updateMutation = useUpdateBlacklistedUser();
  const removeMutation = useUnblacklistUser();

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addMutation.mutateAsync({
        data: { discordId, username, reason }
      });
      toast({ title: "User blacklisted successfully" });
      setIsAddOpen(false);
      setDiscordId("");
      setUsername("");
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["/api/blacklist/users"] });
    } catch (err: any) {
      toast({ 
        variant: "destructive", 
        title: "Error", 
        description: err.message || "Failed to blacklist user" 
      });
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    try {
      await updateMutation.mutateAsync({
        id: selectedUser.id,
        data: { reason }
      });
      toast({ title: "Blacklist updated" });
      setIsEditOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/blacklist/users"] });
    } catch (err: any) {
      toast({ 
        variant: "destructive", 
        title: "Error", 
        description: err.message || "Failed to update blacklist" 
      });
    }
  };

  const handleRemove = async (id: number) => {
    if (!confirm("Are you sure you want to unblacklist this user?")) return;
    try {
      await removeMutation.mutateAsync({ id });
      toast({ title: "User unblacklisted" });
      queryClient.invalidateQueries({ queryKey: ["/api/blacklist/users"] });
    } catch (err: any) {
      toast({ 
        variant: "destructive", 
        title: "Error", 
        description: err.message || "Failed to unblacklist user" 
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">User Blacklist</h1>
        <button 
          onClick={() => setIsAddOpen(true)}
          className="flex items-center px-4 py-2 bg-destructive text-destructive-foreground rounded-md text-sm font-medium hover:bg-destructive/90 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4 mr-2" />
          Blacklist User
        </button>
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

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground bg-muted/40 uppercase">
              <tr>
                <th className="px-6 py-4 font-medium">User</th>
                <th className="px-6 py-4 font-medium">Reason</th>
                <th className="px-6 py-4 font-medium">Added By</th>
                <th className="px-6 py-4 font-medium">Date</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                    <div className="flex justify-center items-center">
                      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mr-3"></div>
                      Loading blacklist...
                    </div>
                  </td>
                </tr>
              ) : data?.data && data.data.length > 0 ? (
                data.data.map((user) => (
                  <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-foreground">{user.username}</div>
                      <div className="text-xs text-muted-foreground font-mono">{user.discordId}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-muted-foreground">{user.reason}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-secondary text-secondary-foreground">
                        {user.addedBy}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground whitespace-nowrap">
                      {format(new Date(user.addedAt), "MMM d, yyyy")}
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <button
                        onClick={() => {
                          setSelectedUser(user);
                          setReason(user.reason);
                          setIsEditOpen(true);
                        }}
                        className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-colors mr-2 inline-flex"
                        title="Edit Reason"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleRemove(user.id)}
                        disabled={removeMutation.isPending}
                        className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors inline-flex disabled:opacity-50"
                        title="Remove from Blacklist"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center border-t border-border">
                    <ShieldAlert className="w-12 h-12 mx-auto text-muted-foreground mb-4 opacity-50" />
                    <h3 className="text-lg font-medium text-foreground mb-1">No blacklisted users</h3>
                    <p className="text-muted-foreground text-sm">The blacklist is currently empty.</p>
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
              <span className="font-medium text-foreground">{data.total}</span> entries
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

      {/* Add Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-border flex justify-between items-center">
              <h2 className="text-lg font-semibold flex items-center">
                <ShieldAlert className="w-5 h-5 mr-2 text-destructive" />
                Blacklist User
              </h2>
              <button onClick={() => setIsAddOpen(false)} className="text-muted-foreground hover:text-foreground">
                <Trash2 className="w-4 h-4" /> {/* Just as a visual close metaphor if we don't have X */}
              </button>
            </div>
            <form onSubmit={handleAdd} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Discord ID</label>
                <input 
                  type="text" 
                  required
                  value={discordId}
                  onChange={e => setDiscordId(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-destructive text-sm"
                  placeholder="e.g. 123456789012345678"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Username</label>
                <input 
                  type="text" 
                  required
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-destructive text-sm"
                  placeholder="e.g. evil_user"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Reason</label>
                <textarea 
                  required
                  rows={3}
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-destructive text-sm resize-none"
                  placeholder="Why is this user being blacklisted?"
                />
              </div>
              <div className="pt-4 flex justify-end space-x-3">
                <button 
                  type="button" 
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-foreground bg-muted hover:bg-muted/80 rounded-md transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={addMutation.isPending}
                  className="px-4 py-2 text-sm font-medium text-destructive-foreground bg-destructive hover:bg-destructive/90 rounded-md transition-colors disabled:opacity-50"
                >
                  {addMutation.isPending ? "Adding..." : "Blacklist"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {isEditOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-border flex justify-between items-center">
              <h2 className="text-lg font-semibold flex items-center">
                <Edit2 className="w-5 h-5 mr-2 text-primary" />
                Edit Blacklist Reason
              </h2>
            </div>
            <form onSubmit={handleEdit} className="p-6 space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-4">
                  Updating reason for <span className="font-semibold text-foreground">{selectedUser.username}</span> ({selectedUser.discordId})
                </p>
                <label className="block text-sm font-medium text-foreground mb-1">Reason</label>
                <textarea 
                  required
                  rows={3}
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-sm resize-none"
                />
              </div>
              <div className="pt-4 flex justify-end space-x-3">
                <button 
                  type="button" 
                  onClick={() => setIsEditOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-foreground bg-muted hover:bg-muted/80 rounded-md transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-md transition-colors disabled:opacity-50"
                >
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}