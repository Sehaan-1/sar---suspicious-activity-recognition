import React from 'react';
import { X, Play } from 'lucide-react';
import { cn } from '../lib/utils';
import { authFetch } from '../lib/auth';
import { Event } from '../types';

interface Props {
  event:          Event | null;
  onClose:        () => void;
  onStatusChange: () => void;
}

export default function EventDetailModal({ event, onClose, onStatusChange }: Props) {
  if (!event) return null;

  const handleMark = async (status: string) => {
    await authFetch(`/api/events/${event.event_id}`, {
      method: 'PATCH',
      body:   JSON.stringify({ status }),
    });
    onStatusChange();
    onClose();
  };

  const severityColors = {
    HIGH:   'bg-red-100 text-red-600 border-red-200',
    MEDIUM: 'bg-orange-100 text-orange-600 border-orange-200',
    LOW:    'bg-yellow-100 text-yellow-700 border-yellow-200',
  } as Record<string, string>;

  return (
    // Backdrop — click outside to close
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Modal card */}
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <span className={cn(
              "px-2.5 py-1 rounded-full text-xs font-bold uppercase border",
              severityColors[event.severity ?? 'LOW'] ?? severityColors.LOW
            )}>
              {event.severity ?? 'LOW'}
            </span>
            <h2 className="font-bold text-slate-800 text-lg">{event.activity_type}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 p-1.5 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* ── Media area ── */}
        <div className="bg-slate-900 w-full aspect-video flex items-center justify-center overflow-hidden">
          {event.clip_path ? (
            <video
              src={`/media/clips/${event.event_id}.mp4`}
              controls
              autoPlay
              className="w-full h-full object-contain"
            />
          ) : event.thumbnail_path ? (
            <img
              src={`/media/thumbs/${event.event_id}.jpg`}
              alt="Event snapshot"
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="flex flex-col items-center gap-3 text-slate-600">
              <Play size={44} className="opacity-20" />
              <p className="text-sm text-slate-500">No media saved for this event</p>
            </div>
          )}
        </div>

        {/* ── Metadata grid ── */}
        <div className="p-6 grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Camera</p>
            <p className="text-slate-800 font-medium">{event.camera_name || `Camera ${event.camera_id}`}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Confidence</p>
            <p className="text-slate-800 font-medium font-mono">
              {((event.confidence || 0) * 100).toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Timestamp</p>
            <p className="text-slate-800 font-mono text-xs">{new Date(event.timestamp).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Status</p>
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
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
          <span className="text-xs text-slate-400 font-mono">Event #{event.event_id}</span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-slate-500 hover:text-slate-700 text-sm font-medium transition-colors rounded-lg hover:bg-slate-100"
            >
              Close
            </button>
            {event.status !== 'FALSE_POSITIVE' && event.status !== 'ACKNOWLEDGED' && (
              <button
                onClick={() => handleMark('FALSE_POSITIVE')}
                className="px-4 py-2 bg-orange-50 hover:bg-orange-100 text-orange-600 border border-orange-200
                           rounded-lg text-sm font-semibold transition-colors"
              >
                False Positive
              </button>
            )}
            {event.status === 'UNREAD' && (
              <button
                onClick={() => handleMark('ACKNOWLEDGED')}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg
                           text-sm font-semibold transition-colors shadow-sm shadow-blue-500/20"
              >
                Mark as Acknowledged
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
