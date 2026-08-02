import React, { useState } from "react";
import { useGetCommandStats, useGetGrowthStats } from "@workspace/api-client-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, LineChart, Line, AreaChart, Area } from "recharts";
import { Terminal, TrendingUp, Users } from "lucide-react";

export default function Stats() {
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("daily");
  
  const { data: commandStats, isLoading: isLoadingCommands } = useGetCommandStats({ period });
  const { data: growthStats, isLoading: isLoadingGrowth } = useGetGrowthStats({ period });

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-popover border border-border p-3 rounded-lg shadow-lg">
          <p className="text-foreground font-medium mb-1">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm flex items-center" style={{ color: entry.color }}>
              <span className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: entry.color }}></span>
              {entry.name}: {entry.value.toLocaleString()}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Analytics & Statistics</h1>
        
        <div className="flex bg-muted rounded-lg p-1 border border-border">
          {(["daily", "weekly", "monthly"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md capitalize transition-colors ${
                period === p 
                  ? "bg-background text-foreground shadow-sm" 
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Primary Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-lg flex items-center">
              <Terminal className="w-5 h-5 mr-2 text-primary" />
              Command Usage
            </h3>
          </div>
          
          <div className="h-[300px] w-full">
            {isLoadingCommands ? (
              <ChartSkeleton />
            ) : commandStats?.chartData && commandStats.chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={commandStats.chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorUsage" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis 
                    dataKey="label" 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={12} 
                    tickLine={false}
                    axisLine={false}
                    dy={10}
                  />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={12} 
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value}
                  />
                  <RechartsTooltip content={<CustomTooltip />} />
                  <Area 
                    type="monotone" 
                    dataKey="value" 
                    name="Commands"
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorUsage)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart />
            )}
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-lg flex items-center">
              <Users className="w-5 h-5 mr-2 text-chart-2" />
              User Growth
            </h3>
          </div>
          
          <div className="h-[300px] w-full">
            {isLoadingGrowth ? (
              <ChartSkeleton />
            ) : growthStats?.userGrowth && growthStats.userGrowth.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={growthStats.userGrowth} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis 
                    dataKey="label" 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={12} 
                    tickLine={false}
                    axisLine={false}
                    dy={10}
                  />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={12} 
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value}
                  />
                  <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted)/0.5)' }} />
                  <Bar 
                    dataKey="value" 
                    name="New Users"
                    fill="hsl(var(--chart-2))" 
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart />
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Most Used Commands */}
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden lg:col-span-1">
          <div className="p-4 border-b border-border bg-muted/20">
            <h3 className="font-semibold text-foreground">Top Commands</h3>
          </div>
          <div className="p-4">
            {isLoadingCommands ? (
              <ListSkeleton />
            ) : commandStats?.topCommands && commandStats.topCommands.length > 0 ? (
              <div className="space-y-4">
                {commandStats.topCommands.map((stat, i) => {
                  const maxCount = Math.max(...commandStats.topCommands.map(s => s.count));
                  const percentage = (stat.count / maxCount) * 100;
                  
                  return (
                    <div key={stat.command}>
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="font-mono text-primary">/{stat.command}</span>
                        <span className="text-muted-foreground font-medium">{stat.count.toLocaleString()}</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary rounded-full" 
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-8">No data available</div>
            )}
          </div>
        </div>

        {/* Server Growth */}
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden lg:col-span-2">
          <div className="p-6">
            <h3 className="font-semibold text-lg flex items-center mb-6">
              <TrendingUp className="w-5 h-5 mr-2 text-chart-3" />
              Server Join/Leave Rate
            </h3>
            <div className="h-[250px] w-full">
              {isLoadingGrowth ? (
                <ChartSkeleton />
              ) : growthStats?.serverGrowth && growthStats.serverGrowth.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={growthStats.serverGrowth} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis 
                      dataKey="label" 
                      stroke="hsl(var(--muted-foreground))" 
                      fontSize={12} 
                      tickLine={false}
                      axisLine={false}
                      dy={10}
                    />
                    <YAxis 
                      stroke="hsl(var(--muted-foreground))" 
                      fontSize={12} 
                      tickLine={false}
                      axisLine={false}
                    />
                    <RechartsTooltip content={<CustomTooltip />} />
                    <Line 
                      type="monotone" 
                      dataKey="value" 
                      name="Net Servers"
                      stroke="hsl(var(--chart-3))" 
                      strokeWidth={3}
                      dot={{ r: 4, strokeWidth: 2, fill: "hsl(var(--background))" }}
                      activeDot={{ r: 6, strokeWidth: 0, fill: "hsl(var(--chart-3))" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="w-full h-full flex flex-col justify-end gap-2 px-4 pb-4">
      <div className="flex items-end justify-between h-full gap-2 opacity-20">
        {[40, 70, 45, 90, 65, 85, 50].map((h, i) => (
          <div key={i} className="w-full bg-primary rounded-t-sm animate-pulse" style={{ height: `${h}%` }}></div>
        ))}
      </div>
      <div className="flex justify-between mt-2 border-t border-border pt-2 opacity-20">
        <div className="w-8 h-3 bg-muted rounded animate-pulse"></div>
        <div className="w-8 h-3 bg-muted rounded animate-pulse"></div>
        <div className="w-8 h-3 bg-muted rounded animate-pulse"></div>
      </div>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="w-full h-full flex items-center justify-center text-muted-foreground border border-dashed border-border rounded-lg bg-muted/5">
      Not enough data for this period
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i}>
          <div className="flex justify-between mb-2">
            <div className="h-4 w-24 bg-muted rounded animate-pulse"></div>
            <div className="h-4 w-12 bg-muted rounded animate-pulse"></div>
          </div>
          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary/20" style={{ width: `${100 - i * 15}%` }}></div>
          </div>
        </div>
      ))}
    </div>
  );
}