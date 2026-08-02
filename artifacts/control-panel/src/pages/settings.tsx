import React, { useState } from "react";
import { 
  useListApiKeys, 
  useCreateApiKey, 
  useDeleteApiKey,
  useListAuditLogs,
  useGetAdminMe
} from "@workspace/api-client-react";
import { format } from "date-fns";
import { 
  Key, 
  Plus, 
  Trash2, 
  ShieldCheck, 
  Copy,
  Check,
  AlertTriangle,
  History,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export default function Settings() {
  const { data: adminMe } = useGetAdminMe();
  const { data: apiKeys, isLoading: isLoadingKeys } = useListApiKeys();
  const [auditPage, setAuditPage] = useState(1);
  const { data: auditLogs, isLoading: isLoadingAudit } = useListAuditLogs({ page: auditPage, limit: 10 });
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createKeyMutation = useCreateApiKey();
  const deleteKeyMutation = useDeleteApiKey();

  // Create Key Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [newKeyData, setNewKeyData] = useState<{name: string, key: string} | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await createKeyMutation.mutateAsync({
        data: { name: keyName }
      });
      setNewKeyData({ name: response.name, key: response.key });
      setKeyName("");
      queryClient.invalidateQueries({ queryKey: ["/api/keys"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
    } catch (err: any) {
      toast({ 
        variant: "destructive", 
        title: "Error", 
        description: err.message || "Failed to create API key" 
      });
    }
  };

  const copyToClipboard = () => {
    if (newKeyData) {
      navigator.clipboard.writeText(newKeyData.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Copied to clipboard" });
    }
  };

  const closeCreateModal = () => {
    setIsCreateOpen(false);
    setNewKeyData(null);
  };

  const handleRevoke = async (id: number, name: string) => {
    if (!confirm(`Are you sure you want to revoke the key "${name}"? This action cannot be undone and any services using it will immediately lose access.`)) return;
    try {
      await deleteKeyMutation.mutateAsync({ id });
      toast({ title: "Key revoked successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/keys"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
    } catch (err: any) {
      toast({ 
        variant: "destructive", 
        title: "Error", 
        description: err.message || "Failed to revoke API key" 
      });
    }
  };

  const isSuperAdmin = adminMe?.role === 'superadmin';

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">System Settings</h1>
        <p className="text-muted-foreground mt-1">Manage API access and view system audit logs.</p>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-border flex justify-between items-center bg-muted/10">
          <div>
            <h2 className="text-lg font-semibold flex items-center">
              <Key className="w-5 h-5 mr-2 text-primary" />
              API Keys
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Keys allow external services to send command logs to this control panel.
            </p>
          </div>
          {isSuperAdmin && (
            <button
              onClick={() => setIsCreateOpen(true)}
              className="flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4 mr-2" />
              Generate Key
            </button>
          )}
        </div>

        <div className="p-6">
          {!isSuperAdmin && (
            <div className="mb-6 p-4 bg-muted border border-border rounded-lg flex items-start text-sm text-muted-foreground">
              <ShieldCheck className="w-5 h-5 mr-3 text-primary flex-shrink-0" />
              <p>You have viewer access. Only superadmins can generate or revoke API keys.</p>
            </div>
          )}

          {isLoadingKeys ? (
            <div className="space-y-4">
              {[1, 2].map(i => (
                <div key={i} className="flex justify-between items-center p-4 border border-border rounded-lg animate-pulse">
                  <div>
                    <div className="h-4 w-32 bg-muted rounded mb-2"></div>
                    <div className="h-3 w-48 bg-muted rounded"></div>
                  </div>
                  <div className="h-8 w-20 bg-muted rounded"></div>
                </div>
              ))}
            </div>
          ) : apiKeys && apiKeys.length > 0 ? (
            <div className="space-y-4">
              {apiKeys.map((key) => (
                <div key={key.id} className="flex flex-col sm:flex-row justify-between sm:items-center p-4 border border-border rounded-lg bg-background hover:border-primary/30 transition-colors gap-4">
                  <div>
                    <div className="flex items-center mb-1">
                      <span className="font-semibold text-foreground">{key.name}</span>
                      <span className="ml-3 font-mono text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                        {key.prefix}••••••••
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center space-x-4">
                      <span>Created: {format(new Date(key.createdAt), "MMM d, yyyy")}</span>
                      <span>
                        Last used: {key.lastUsedAt ? format(new Date(key.lastUsedAt), "MMM d, yyyy") : "Never"}
                      </span>
                    </div>
                  </div>
                  
                  {isSuperAdmin && (
                    <button
                      onClick={() => handleRevoke(key.id, key.name)}
                      disabled={deleteKeyMutation.isPending}
                      className="px-3 py-1.5 text-sm font-medium text-destructive bg-destructive/10 hover:bg-destructive hover:text-destructive-foreground rounded-md transition-colors disabled:opacity-50 whitespace-nowrap"
                    >
                      Revoke Key
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-10 border border-dashed border-border rounded-lg bg-muted/5">
              <Key className="w-10 h-10 mx-auto text-muted-foreground mb-3 opacity-50" />
              <h3 className="text-base font-medium text-foreground mb-1">No API keys found</h3>
              <p className="text-muted-foreground text-sm">Create an API key to connect your Discord bot.</p>
            </div>
          )}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-border bg-muted/10">
          <h2 className="text-lg font-semibold flex items-center">
            <History className="w-5 h-5 mr-2 text-primary" />
            Audit Logs
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Track administrative actions taken in the control panel.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground bg-muted/40 uppercase">
              <tr>
                <th className="px-6 py-4 font-medium">Admin</th>
                <th className="px-6 py-4 font-medium">Action</th>
                <th className="px-6 py-4 font-medium">Target</th>
                <th className="px-6 py-4 font-medium">Details</th>
                <th className="px-6 py-4 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoadingAudit ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                    <div className="flex justify-center items-center">
                      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mr-3"></div>
                      Loading audit logs...
                    </div>
                  </td>
                </tr>
              ) : auditLogs?.data && auditLogs.data.length > 0 ? (
                auditLogs.data.map((log) => (
                  <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4">
                      <span className="font-medium text-foreground">{log.adminUsername || `Admin #${log.adminId}`}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-secondary text-secondary-foreground uppercase tracking-wider">
                        {log.action.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs">
                      {log.target}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground truncate max-w-xs">
                      {log.detail || '-'}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground whitespace-nowrap">
                      {format(new Date(log.createdAt), "MMM d, HH:mm:ss")}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                    No audit logs available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Audit Pagination */}
        {auditLogs && auditLogs.total > 0 && (
          <div className="px-6 py-4 border-t border-border bg-muted/10 flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Showing <span className="font-medium text-foreground">{(auditPage - 1) * 10 + 1}</span> to{' '}
              <span className="font-medium text-foreground">{Math.min(auditPage * 10, auditLogs.total)}</span> of{' '}
              <span className="font-medium text-foreground">{auditLogs.total}</span> logs
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => setAuditPage(p => Math.max(1, p - 1))}
                disabled={auditPage === 1}
                className="p-2 border border-border rounded-md hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setAuditPage(p => p + 1)}
                disabled={auditPage * 10 >= auditLogs.total}
                className="p-2 border border-border rounded-md hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create Key Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-border flex justify-between items-center">
              <h2 className="text-lg font-semibold flex items-center">
                <Key className="w-5 h-5 mr-2 text-primary" />
                {newKeyData ? "API Key Created" : "Generate API Key"}
              </h2>
            </div>
            
            {!newKeyData ? (
              <form onSubmit={handleCreateKey} className="p-6 space-y-4">
                <div className="mb-2 p-3 bg-primary/10 border border-primary/20 rounded-md text-sm text-primary flex items-start">
                  <AlertTriangle className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
                  <p>Store your key securely. You won't be able to see it again after generating it.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Key Name</label>
                  <input 
                    type="text" 
                    required
                    value={keyName}
                    onChange={e => setKeyName(e.target.value)}
                    className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                    placeholder="e.g. Production Bot"
                  />
                </div>
                <div className="pt-4 flex justify-end space-x-3">
                  <button 
                    type="button" 
                    onClick={() => setIsCreateOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-foreground bg-muted hover:bg-muted/80 rounded-md transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={createKeyMutation.isPending}
                    className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-md transition-colors disabled:opacity-50"
                  >
                    {createKeyMutation.isPending ? "Generating..." : "Generate Key"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="p-6 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Your new API key for "{newKeyData.name}" has been generated. 
                  <strong className="text-foreground block mt-1">Copy it now, you won't be able to see it again.</strong>
                </p>
                
                <div className="mt-4 relative">
                  <input 
                    type="text" 
                    readOnly 
                    value={newKeyData.key}
                    className="w-full pl-3 pr-12 py-3 bg-muted border border-border rounded-md font-mono text-sm text-foreground focus:outline-none"
                  />
                  <button
                    onClick={copyToClipboard}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground hover:bg-background rounded-md transition-colors"
                    title="Copy to clipboard"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                
                <div className="pt-6 flex justify-end">
                  <button 
                    onClick={closeCreateModal}
                    className="w-full px-4 py-2 text-sm font-medium text-foreground bg-secondary hover:bg-secondary/80 rounded-md transition-colors"
                  >
                    I have copied my key
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}