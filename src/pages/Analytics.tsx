import React, { useEffect, useState } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { Download, Activity, AlertTriangle, Video, Loader2 } from 'lucide-react';
import { authFetch } from '../lib/auth';
import { useWebSocket } from '../hooks/useWebSocket';

const COLORS = ['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6'];

export default function Analytics() {
  const [loading, setLoading] = useState(true);
  const [summaryData, setSummaryData] = useState<{ total: number, byType: any[] } | null>(null);
  const [timeSeriesData, setTimeSeriesData] = useState<{ date: string, count: number }[]>([]);
  const { alerts } = useWebSocket();

  const fetchAnalytics = () => {
    setLoading(true);
    // Fetch last 7 days by default to match capstone robust functionality
    const endDate = new Date().toISOString().split('T')[0];
    const d = new Date();
    d.setDate(d.getDate() - 6);
    const startDate = d.toISOString().split('T')[0];

    Promise.all([
      authFetch('/api/dashboard/summary').then(res => res.json()),
      authFetch(`/api/dashboard/events-per-day?startDate=${startDate}&endDate=${endDate}`).then(res => res.json())
    ]).then(([summary, timeSeries]) => {
      setSummaryData(summary);
      setTimeSeriesData(timeSeries);
      setLoading(false);
    }).catch(err => {
      console.error('Failed to load analytics', err);
      setLoading(false);
    });
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  useEffect(() => {
    if (alerts.length === 0) return;
    fetchAnalytics();
  }, [alerts]);

  const exportCSV = () => {
    if (!timeSeriesData.length && (!summaryData || !summaryData.byType.length)) return;

    let csvContent = "data:text/csv;charset=utf-8,";
    
    // Section 1: Time Series
    csvContent += "Date,Event Count\n";
    timeSeriesData.forEach(row => {
      csvContent += `${row.date},${row.count}\n`;
    });
    
    csvContent += "\n";

    // Section 2: Summary By Type
    if (summaryData && summaryData.byType) {
      csvContent += "Event Type,Total Count\n";
      summaryData.byType.forEach((row: any) => {
        csvContent += `${row.activity_type},${row.count}\n`;
      });
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `SAR_Analytics_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="flex-1 flex justify-center items-center h-full bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  // Format data for Pie Chart
  const pieData = summaryData?.byType.map((item: any) => ({
    name: item.activity_type,
    value: item.count
  })) || [];

  return (
    <div className="flex-1 flex flex-col overflow-auto bg-slate-50">
      <div className="p-6 border-b border-slate-200 bg-white flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-1">Analytics Dashboard</h1>
          <p className="text-sm text-slate-500">System-wide AI detection insights</p>
        </div>
        <button 
          onClick={exportCSV}
          className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white font-medium text-sm rounded-lg hover:bg-slate-800 transition-colors shadow-sm"
        >
          <Download size={16} /> Export CSV Report
        </button>
      </div>

      <div className="p-6 space-y-6 max-w-7xl mx-auto w-full">
        
        {/* KPI Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="p-4 bg-blue-50 text-blue-600 rounded-xl">
              <Activity size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Total Events (All Time)</p>
              <h3 className="text-2xl font-bold text-slate-900">{summaryData?.total || 0}</h3>
            </div>
          </div>
          
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="p-4 bg-red-50 text-red-600 rounded-xl">
              <AlertTriangle size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Critical Alerts</p>
              <h3 className="text-2xl font-bold text-slate-900">
                {summaryData?.byType?.find((t: any) => t.activity_type?.toLowerCase().includes('fight'))?.count || 0}
              </h3>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="p-4 bg-green-50 text-green-600 rounded-xl">
              <Video size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Highest Volume Type</p>
              <h3 className="text-lg font-bold text-slate-900 capitalize">
                {[...pieData].sort((a,b) => b.value - a.value)[0]?.name || 'N/A'}
              </h3>
            </div>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Time Series Bar Chart */}
          <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 mb-6">Event Trends (Last 7 Days)</h3>
            <div className="h-72 w-full">
              {timeSeriesData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={timeSeriesData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fill: '#64748b', fontSize: 12 }} 
                      axisLine={false} 
                      tickLine={false}
                      tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}
                    />
                    <YAxis 
                      tick={{ fill: '#64748b', fontSize: 12 }} 
                      axisLine={false} 
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <RechartsTooltip 
                      cursor={{ fill: '#f8fafc' }}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={50} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400">
                  No data available for the selected period
                </div>
              )}
            </div>
          </div>

          {/* Pie Chart */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Events by Type</h3>
            <div className="flex-1 min-h-[250px] w-full">
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {pieData.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                 <div className="h-full flex items-center justify-center text-slate-400">
                  No events logged
                </div>
              )}
            </div>
            {/* Custom Legend */}
            <div className="flex flex-wrap gap-3 justify-center mt-2">
              {pieData.map((entry: any, index: number) => (
                <div key={entry.name} className="flex items-center gap-1.5 text-xs text-slate-600">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                  <span className="capitalize">{entry.name}</span>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
