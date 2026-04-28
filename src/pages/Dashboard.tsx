import React, { useEffect, useState } from 'react';
import { Camera, AlertCircle, Clock, ShieldCheck, Activity, Video } from 'lucide-react';
import { cn } from '../lib/utils';
import { useWebSocket } from '../hooks/useWebSocket';
import { authFetch } from '../lib/auth';

export default function Dashboard() {
  const { alerts } = useWebSocket();
  const [stats, setStats] = useState({ total: 0, byType: [] });
  const [cameras, setCameras] = useState<any[]>([]);
  const [streamErrors, setStreamErrors] = useState<Record<number, boolean>>({});

  useEffect(() => {
    authFetch('/api/dashboard/summary')
      .then(res => res.json())
      .then(setStats)
      .catch(console.error);

    authFetch('/api/cameras')
      .then(res => res.json())
      .then(setCameras)
      .catch(console.error);
  }, [alerts]); // Refresh stats when new alerts come in

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Top Header Bar replacing the old simple header */}
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0">
        <div className="flex gap-8">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">Active Streams</span>
            <span className="text-sm font-semibold text-slate-900">{cameras.filter((cam: any) => cam.status === 'ONLINE' || cam.status === 'ACTIVE').length} / {cameras.length} Channels</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">Alerts (24h)</span>
            <span className="text-sm font-semibold text-red-600 font-mono">{stats.total} Detections</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">Latency</span>
            <span className="text-sm font-semibold text-slate-900">~840ms</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-slate-100 px-3 py-1.5 rounded-full text-xs font-medium text-slate-600">v1.0.4 - Production</div>
          <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center text-xs font-semibold text-slate-500">OP</div>
        </div>
      </header>

      <div className="p-8 flex gap-8 h-full overflow-hidden">
        
        {/* Left Side Content */}
        <div className="flex-1 flex flex-col gap-6 overflow-y-auto pr-2">
          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 shrink-0">
            <StatCard 
              title="Total Events (24h)" 
              value={stats.total.toString()} 
              icon={Activity} 
              trend="+12%" 
            />
            <StatCard 
              title="Active Cameras" 
              value={cameras.length.toString()} 
              icon={Camera} 
              trend="Stable"
            />
            <StatCard 
              title="High Severity Alerts" 
              value={stats.byType.find((t: any) => t.activity_type === 'FIGHTING')?.count || '0'} 
              icon={AlertCircle} 
              trend="-2%"
              color="text-red-500"
            />
            <StatCard 
              title="System Uptime" 
              value="99.9%" 
              icon={ShieldCheck} 
              trend="All clear"
              color="text-green-500"
            />
          </div>

          <div className="flex-1 flex flex-col min-h-[400px]">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2 mb-4">
              <Video size={14} className="text-blue-500" />
              Live Monitored Feeds
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1">
              {cameras.map((cam: any, index: number) => (
                <div key={cam.camera_id} className="bg-slate-900 rounded-xl overflow-hidden relative border border-slate-800 flex items-center justify-center min-h-[200px]">
                  <div className="absolute top-3 left-3 flex gap-2 z-10">
                    <span className="px-2 py-0.5 bg-black/60 backdrop-blur text-[10px] text-white font-bold rounded uppercase tracking-tighter border border-white/20">Cam 0{index + 1}: {cam.name}</span>
                    <span className={cn(
                      "px-2 py-0.5 backdrop-blur text-[10px] text-white font-bold rounded uppercase tracking-tighter",
                      cam.status === 'ONLINE' || cam.status === 'ACTIVE' ? "bg-green-500/80" :
                      cam.status === 'RETRYING' ? "bg-yellow-500/80" : "bg-red-500/80"
                    )}>{cam.status === 'ACTIVE' ? 'READY' : cam.status}</span>
                  </div>
                  
                  {/* Live MJPEG Stream */}
                  <div className="w-full h-full bg-black relative" style={{ minHeight: '160px' }}>
                    <img
                      src={`/stream/${cam.camera_id}`}
                      alt={`${cam.name} feed`}
                      className="w-full h-full object-cover"
                      style={{ minHeight: '160px', display: 'block' }}
                      onError={() => setStreamErrors(prev => ({ ...prev, [cam.camera_id]: true }))}
                      onLoad={() => setStreamErrors(prev => ({ ...prev, [cam.camera_id]: false }))}
                    />
                    {streamErrors[cam.camera_id] && (
                      <div className="absolute inset-0 flex items-center justify-center bg-slate-950 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Stream offline
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Sidebar Feed */}
        <div className="w-72 flex flex-col shrink-0">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Live Alerts</h3>
            <span className="text-[10px] text-blue-500 font-bold uppercase tracking-tighter cursor-pointer hover:underline">Clear All</span>
          </div>
          
          <div className="space-y-3 overflow-y-auto flex-1 pr-1">
            {alerts.length === 0 ? (
              <div className="h-32 flex flex-col items-center justify-center bg-white border border-slate-200 rounded-lg shadow-sm text-slate-400 text-sm">
                <ShieldCheck size={24} className="mb-2 opacity-50" />
                <p className="text-xs font-semibold">No recent alerts</p>
              </div>
            ) : (
              alerts.map((alert, i) => (
                <div 
                  key={alert.event_id || i}
                  className={cn(
                    "bg-white border-l-4 p-4 rounded-r-lg shadow-sm relative overflow-hidden transition-all hover:bg-slate-50",
                    alert.severity === 'HIGH' ? "border-red-500" :
                    alert.severity === 'MEDIUM' ? "border-orange-500" : "border-slate-200"
                  )}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className={cn(
                      "text-xs font-bold uppercase",
                      alert.severity === 'HIGH' ? "text-red-600" :
                      alert.severity === 'MEDIUM' ? "text-orange-600" : "text-slate-500"
                    )}>{alert.activity_type}</span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {new Date(alert.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-slate-800 mb-2">
                    Event triggered on {alert.camera_name || `Cam 0${alert.camera_id}`}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-slate-500">
                      CONF: {(alert.confidence * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
          
          <div className="mt-4 shrink-0">
           <button 
             onClick={() => {
               // Simulate an event
               authFetch('/api/simulate/event', {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({
                   camera_id: Math.floor(Math.random() * cameras.length) + 1 || 1,
                   activity_type: ['LOITERING', 'TRESPASSING', 'UNATTENDED_BAG', 'FIGHTING'][Math.floor(Math.random() * 4)],
                   severity: ['LOW', 'MEDIUM', 'HIGH'][Math.floor(Math.random() * 3)],
                   confidence: 0.75 + (Math.random() * 0.2), // 75% - 95%
                 })
               })
             }}
             className="w-full py-2.5 bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-100 text-[10px] uppercase font-bold tracking-wider rounded-lg transition-colors shadow-sm"
           >
             Simulate Event
           </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, trend, color = "text-slate-900" }: any) {
  return (
    <div className="bg-white p-5 rounded-xl border border-slate-200 flex flex-col gap-3 shadow-sm">
      <div className="flex justify-between items-start">
        <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">{title}</span>
        <Icon size={16} className="text-slate-400" />
      </div>
      <div className="flex items-end justify-between">
        <span className={cn("text-3xl font-bold tracking-tight", color)}>{value}</span>
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{trend}</span>
      </div>
    </div>
  );
}
