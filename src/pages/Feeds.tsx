import React, { useEffect, useState } from 'react';
import { Video, Grid, Square, Maximize, Settings, Plus, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { Camera } from '../types';
import { authFetch } from '../lib/auth';
import AddCameraModal from '../components/AddCameraModal';
import ROIEditorModal from '../components/ROIEditorModal';

export default function Feeds() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [layout, setLayout] = useState<'grid' | 'single'>('grid');
  const [showAddModal, setShowAddModal] = useState(false);
  
  // For Maximize/Settings
  const [focusedCamId, setFocusedCamId] = useState<number | null>(null);
  const [roiCamera, setRoiCamera] = useState<Camera | null>(null);

  const fetchCameras = () => {
    authFetch('/api/cameras')
      .then((res) => res.json())
      .then((data) => {
        setCameras(data);
        setLoading(false);
      });
  };

  const deleteCamera = (id: number) => {
    if (!window.confirm('Are you sure you want to delete this camera? This cannot be undone.')) return;
    authFetch(`/api/cameras/${id}`, { method: 'DELETE' })
      .then(() => fetchCameras());
  };

  useEffect(() => {
    fetchCameras();
  }, []);

  const handleMaximize = (id: number) => {
    setFocusedCamId(id);
    setLayout('single');
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      {/* Header */}
      <div className="p-6 border-b border-slate-200 bg-white flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1 tracking-tight">Live Video Feeds</h1>
          <p className="text-sm text-slate-500">Monitoring {cameras.length} active streams</p>
        </div>
        
        <div className="flex gap-4 items-center">
          <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button 
              onClick={() => setLayout('grid')}
              className={cn(
                "p-1.5 rounded-md transition-colors",
                layout === 'grid' ? "bg-white shadow-sm text-slate-900" : "text-slate-400 hover:text-slate-600"
              )}
              title="Grid View"
            >
              <Grid size={18} />
            </button>
            <button 
              onClick={() => setLayout('single')}
              className={cn(
                "p-1.5 rounded-md transition-colors",
                layout === 'single' ? "bg-white shadow-sm text-slate-900" : "text-slate-400 hover:text-slate-600"
              )}
              title="Focus View"
            >
              <Square size={18} />
            </button>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 border border-blue-700 rounded-lg text-sm font-medium text-white hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus size={16} />
            Add Camera
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex justify-center items-center h-full text-slate-400">
            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full"></div>
          </div>
        ) : (
          <div className={cn(
            "grid gap-6 h-full",
            layout === 'grid' 
              ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-2" 
              : "grid-cols-1"
          )}>
            {cameras.map((cam, index) => (
              <div 
                key={cam.camera_id} 
                className={cn(
                  "bg-slate-900 rounded-xl overflow-hidden relative border border-slate-800 flex flex-col group",
                  layout === 'single' && (focusedCamId ? cam.camera_id !== focusedCamId : index !== 0) ? "hidden" : "min-h-[300px]"
                )}
              >
                {/* Camera Overlay Toolbar */}
                <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent flex justify-between items-start z-10 transition-opacity">
                  <div className="flex gap-2">
                    <span className="px-2.5 py-1 bg-black/60 backdrop-blur text-[10px] text-white font-bold rounded shadow-sm tracking-widest uppercase border border-white/10">
                      CAM 0{index + 1}: {cam.name}
                    </span>
                    <span className="px-2 py-1 bg-green-500/80 backdrop-blur text-[10px] text-white font-bold rounded shadow-sm uppercase tracking-tighter flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></div>
                      LIVE
                    </span>
                  </div>
                  
                  {/* Hover Controls */}
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => deleteCamera(cam.camera_id)}
                      className="p-1.5 bg-black/50 backdrop-blur text-white hover:text-red-400 rounded transition-colors border border-white/10"
                      title="Delete Camera"
                    >
                      <Trash2 size={14} />
                    </button>
                    <button 
                      onClick={() => setRoiCamera(cam)}
                      className="p-1.5 bg-black/50 backdrop-blur text-white hover:text-blue-400 rounded transition-colors border border-white/10"
                      title="Edit ROI"
                    >
                      <Settings size={14} />
                    </button>
                    <button 
                      onClick={() => handleMaximize(cam.camera_id)}
                      className="p-1.5 bg-black/50 backdrop-blur text-white hover:text-blue-400 rounded transition-colors border border-white/10"
                      title="Maximize"
                    >
                      <Maximize size={14} />
                    </button>
                  </div>
                </div>
                
                {/* Live MJPEG Stream */}
                <div className="flex-1 w-full relative bg-black" style={{ minHeight: '200px' }}>
                  <img
                    src={`http://localhost:5001/stream/${cam.camera_id}`}
                    alt={`Camera ${cam.name} live feed`}
                    className="w-full h-full object-cover"
                    style={{ display: 'block', minHeight: '200px' }}
                    onError={(e) => {
                      const el = e.target as HTMLImageElement;
                      el.style.opacity = '0';
                    }}
                    onLoad={(e) => {
                      const el = e.target as HTMLImageElement;
                      el.style.opacity = '1';
                    }}
                  />
                  {/* Subtle scan line overlay */}
                  <div className="absolute top-0 left-0 right-0 h-px bg-blue-500/30 animate-[scan_4s_ease-in-out_infinite] pointer-events-none" />
                </div>

                {/* Bottom Bar Info */}
                <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent flex justify-between items-end z-10">
                  <span className="text-slate-400 font-mono text-[10px]">
                    RES: 1080P / 15 FPS
                  </span>
                  <span className="text-slate-400 font-mono text-[10px] tracking-widest">
                    MODEL: YOLOv8s + BYTETRACK
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Custom CSS for scanline animation local to this module */}
      <style>{`
        @keyframes scan {
          0% { transform: translateY(0); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(300px); opacity: 0; }
        }
      `}</style>

      <AddCameraModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={fetchCameras}
      />

      <ROIEditorModal
        camera={roiCamera}
        isOpen={!!roiCamera}
        onClose={() => setRoiCamera(null)}
        onSuccess={fetchCameras}
      />
    </div>
  );
}
