import React, { useEffect, useState } from 'react';
import { Search, Filter, AlertTriangle, ShieldCheck, Download, Trash2, ShieldAlert, X, ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';
import { Event, Camera } from '../types';
import { authFetch } from '../lib/auth';
import { useWebSocket } from '../hooks/useWebSocket';
import EventDetailModal from '../components/EventDetailModal';

export default function Events() {
  const [events,    setEvents]    = useState<Event[]>([]);
  const [cameras,   setCameras]   = useState<Camera[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [selected,    setSelected]    = useState<Event | null>(null);
  const [checkedIds,  setCheckedIds]  = useState<Set<number>>(new Set());
  const [showFilters, setShowFilters] = useState(false);

  // Filter state
  const [search,     setSearch]     = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [camFilter,  setCamFilter]  = useState('ALL');
  const [dateFrom,   setDateFrom]   = useState('');
  const [dateTo,     setDateTo]     = useState('');

  const { alerts } = useWebSocket();

  // ── Data loading ──────────────────────────────────────────────────────────
  const fetchEvents = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (typeFilter !== 'ALL') params.append('activity', typeFilter);
    if (camFilter !== 'ALL') params.append('camera_id', camFilter);
    if (dateFrom) params.append('from', dateFrom);
    if (dateTo) params.append('to', dateTo);

    authFetch(`/api/events?${params.toString()}`)
      .then(res => res.json())
      .then(data => { setEvents(data); setLoading(false); });
  };

  useEffect(() => {
    authFetch('/api/cameras').then(r => r.json()).then(setCameras);
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [typeFilter, camFilter, dateFrom, dateTo]);

  // Real-time: prepend new alerts from WebSocket
  useEffect(() => {
    if (alerts.length === 0) return;
    const latest = alerts[0];
    setEvents(prev => {
      // Avoid duplicates
      if (prev.some(e => e.event_id === latest.event_id)) return prev;
      return [latest, ...prev];
    });
  }, [alerts]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const markStatus = (id: number, status: string) => {
    authFetch(`/api/events/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status }),
    }).then(() => fetchEvents());
  };

  const deleteEvent = (id: number) => {
    if (!window.confirm('Permanently delete this event log?')) return;
    authFetch(`/api/events/${id}`, { method: 'DELETE' })
      .then(() => { setCheckedIds(new Set()); fetchEvents(); });
  };

  const bulkDelete = () => {
    const ids = Array.from(checkedIds);
    if (!window.confirm(`Permanently delete ${ids.length} selected event(s)?`)) return;
    authFetch('/api/events', {
      method: 'DELETE',
      body: JSON.stringify({ ids }),
    }).then(() => { setCheckedIds(new Set()); fetchEvents(); });
  };

  const toggleCheck = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setCheckedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── Filtering (client-side, instant) ─────────────────────────────────────
  const filtered = events.filter(e => {
    const q = search.toLowerCase();
    const matchSearch = !q
      || e.activity_type.toLowerCase().includes(q)
      || (e.camera_name ?? '').toLowerCase().includes(q);

    const matchType = typeFilter === 'ALL' || e.activity_type === typeFilter;
    const matchCam  = camFilter  === 'ALL' || String(e.camera_id) === camFilter;

    const ts        = new Date(e.timestamp).getTime();
    const matchFrom = !dateFrom || ts >= new Date(dateFrom).getTime();
    const matchTo   = !dateTo   || ts <= new Date(dateTo.includes('T') ? dateTo : dateTo + 'T23:59:59').getTime();

    return matchSearch && matchType && matchCam && matchFrom && matchTo;
  });

  const hasFilters = typeFilter !== 'ALL' || camFilter !== 'ALL' || dateFrom || dateTo;

  const allChecked = filtered.length > 0 && filtered.every(e => checkedIds.has(e.event_id));
  const toggleAll  = () => {
    if (allChecked) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(filtered.map(e => e.event_id)));
    }
  };

  const clearFilters = () => {
    setTypeFilter('ALL'); setCamFilter('ALL');
    setDateFrom('');      setDateTo('');
  };

  // ── CSV Export ────────────────────────────────────────────────────────────
  const exportCSV = () => {
    const headers = ['ID', 'Timestamp', 'Type', 'Camera', 'Confidence', 'Severity', 'Status'];
    const rows = filtered.map(e => [
      e.event_id,
      new Date(e.timestamp).toLocaleString(),
      e.activity_type,
      e.camera_name || `Cam ${e.camera_id}`,
      ((e.confidence || 0) * 100).toFixed(1) + '%',
      e.severity,
      e.status,
    ]);

    const csv  = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `sar-events-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">

      {/* ── Header ── */}
      <div className="p-6 border-b border-slate-200 bg-white shrink-0">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Event Database</h1>
          <span className="text-xs text-slate-400 font-mono">
            {filtered.length} / {events.length} events
          </span>
        </div>

        {/* Search + action bar */}
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by type or camera..."
              className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 pl-9 pr-4 text-sm
                         text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500
                         focus:ring-1 focus:ring-blue-500 transition-all"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={14} />
              </button>
            )}
          </div>

          <button
            onClick={() => setShowFilters(v => !v)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium transition-colors shadow-sm",
              showFilters || hasFilters
                ? "bg-blue-50 border-blue-200 text-blue-700"
                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
            )}
          >
            <Filter size={16} />
            Filters
            {hasFilters && (
              <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
            )}
            <ChevronDown size={14} className={cn("transition-transform", showFilters && "rotate-180")} />
          </button>

          <button
            onClick={exportCSV}
            disabled={filtered.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg
                       text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-sm
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download size={16} />
            Export CSV
          </button>
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Type</label>
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900
                           focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">All Types</option>
                <option value="LOITERING">Loitering</option>
                <option value="TRESPASSING">Trespassing</option>
                <option value="UNATTENDED_BAG">Unattended Bag</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Camera</label>
              <select
                value={camFilter}
                onChange={e => setCamFilter(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900
                           focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">All Cameras</option>
                {cameras.map(c => (
                  <option key={c.camera_id} value={String(c.camera_id)}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">From</label>
              <input
                type="datetime-local"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900
                           focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">To</label>
              <input
                type="datetime-local"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900
                           focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {hasFilters && (
              <div className="col-span-full flex justify-end">
                <button onClick={clearFilters} className="text-xs text-blue-600 hover:underline font-medium">
                  Clear all filters
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto p-6">

        {/* Bulk action bar */}
        {checkedIds.size > 0 && (
          <div className="mb-3 flex items-center justify-between px-4 py-3 bg-blue-600 text-white rounded-xl shadow-lg">
            <span className="text-sm font-semibold">
              {checkedIds.size} event{checkedIds.size > 1 ? 's' : ''} selected
            </span>
            <div className="flex gap-3">
              <button
                onClick={() => setCheckedIds(new Set())}
                className="text-sm text-blue-100 hover:text-white transition-colors"
              >
                Clear selection
              </button>
              <button
                onClick={bulkDelete}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 hover:bg-red-400
                           text-white text-sm font-semibold rounded-lg transition-colors"
              >
                <Trash2 size={14} />
                Delete selected
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center items-center h-64 text-slate-400">
            <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs font-bold uppercase tracking-wider">
                <tr>
                  {/* Select-all checkbox */}
                  <th className="pl-4 py-4 w-10" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={allChecked}
                      onChange={toggleAll}
                      className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                      title={allChecked ? 'Deselect all' : 'Select all'}
                    />
                  </th>
                  <th className="px-4 py-4">Timestamp</th>
                  <th className="px-4 py-4">Snapshot</th>
                  <th className="px-6 py-4">Type</th>
                  <th className="px-6 py-4">Camera</th>
                  <th className="px-6 py-4">Confidence</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(event => (
                  <tr
                    key={event.event_id}
                    onClick={() => setSelected(event)}
                    className={cn(
                      "hover:bg-blue-50/40 cursor-pointer transition-colors",
                      checkedIds.has(event.event_id) && "bg-blue-50"
                    )}
                  >
                    {/* Checkbox */}
                    <td className="pl-4 py-4 w-10" onClick={e => toggleCheck(event.event_id, e)}>
                      <input
                        type="checkbox"
                        checked={checkedIds.has(event.event_id)}
                        onChange={() => {}}
                        className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                      />
                    </td>

                    {/* Timestamp */}
                    <td className="px-4 py-4 font-mono text-xs text-slate-500">
                      {new Date(event.timestamp).toLocaleString()}
                    </td>

                    {/* Snapshot thumbnail */}
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      {event.thumbnail_path ? (
                        <img
                          src={`/media/thumbs/${event.event_id}.jpg`}
                          alt="snapshot"
                          className="w-16 h-10 object-cover rounded border border-slate-200
                                     cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => setSelected(event)}
                        />
                      ) : (
                        <div className="w-16 h-10 bg-slate-100 rounded border border-slate-200 flex items-center justify-center">
                          <span className="text-slate-300 text-xs">—</span>
                        </div>
                      )}
                    </td>

                    {/* Type */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "w-2 h-2 rounded-full shrink-0",
                          event.severity === 'HIGH'   ? "bg-red-500" :
                          event.severity === 'MEDIUM' ? "bg-orange-500" : "bg-yellow-500"
                        )} />
                        <span className="font-semibold text-slate-900">{event.activity_type}</span>
                      </div>
                    </td>

                    {/* Camera */}
                    <td className="px-6 py-4 text-slate-600 font-medium">
                      {event.camera_name || `Cam ${event.camera_id}`}
                    </td>

                    {/* Confidence */}
                    <td className="px-6 py-4 text-slate-600 font-mono">
                      {((event.confidence || 0) * 100).toFixed(1)}%
                    </td>

                    {/* Status badge */}
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider",
                        event.status === 'UNREAD'
                          ? "bg-red-50 text-red-600 border border-red-100"
                          : event.status === 'ACKNOWLEDGED'
                          ? "bg-green-50 text-green-600 border border-green-100"
                          : "bg-slate-100 text-slate-500 border border-slate-200"
                      )}>
                        {event.status}
                      </span>
                    </td>

                    {/* Actions — stop row click propagation */}
                    <td className="px-6 py-4 text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        {event.status === 'UNREAD' && (
                          <button
                            onClick={() => markStatus(event.event_id, 'ACKNOWLEDGED')}
                            className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors
                                       border border-transparent hover:border-green-100"
                            title="Acknowledge"
                          >
                            <ShieldCheck size={18} />
                          </button>
                        )}
                        <button
                          onClick={() => deleteEvent(event.event_id)}
                          className="p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500
                                     rounded-lg transition-colors border border-transparent hover:border-red-100"
                          title="Delete log"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-16 text-center text-slate-400">
                      <ShieldAlert size={36} className="mx-auto mb-3 opacity-20" />
                      <p className="font-medium text-sm">
                        {events.length === 0 ? 'No events recorded yet' : 'No events match your filters'}
                      </p>
                      {hasFilters && (
                        <button onClick={clearFilters} className="mt-2 text-xs text-blue-600 hover:underline">
                          Clear filters
                        </button>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail modal */}
      <EventDetailModal
        event={selected}
        onClose={() => setSelected(null)}
        onStatusChange={fetchEvents}
      />
    </div>
  );
}
