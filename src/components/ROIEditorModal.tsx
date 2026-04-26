import React, { useState, useRef, useEffect } from 'react';
import { Camera, X, Loader2, Save, Undo, Trash2 } from 'lucide-react';
import { authFetch } from '../lib/auth';
import { Camera as CameraType } from '../types';

interface Props {
  camera: CameraType | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type Point = { x: number; y: number };

export default function ROIEditorModal({ camera, isOpen, onClose, onSuccess }: Props) {
  const [points, setPoints] = useState<Point[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load existing ROI if present
  useEffect(() => {
    if (camera && camera.roi_polygon) {
      try {
        const parsed = JSON.parse(camera.roi_polygon);
        if (Array.isArray(parsed)) {
          setPoints(parsed.map(p => ({ x: p[0], y: p[1] })));
        }
      } catch (e) {
        setPoints([]);
      }
    } else {
      setPoints([]);
    }
  }, [camera, isOpen]);

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    
    // Calculate relative coordinates (0.0 to 1.0)
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    
    setPoints(prev => [...prev, { x, y }]);
  };

  const handleUndo = () => {
    setPoints(prev => prev.slice(0, -1));
  };

  const handleClear = () => {
    setPoints([]);
  };

  const handleSave = async () => {
    if (!camera) return;
    setIsSaving(true);
    
    // Convert back to tuple array for the backend [ [x,y], [x,y] ]
    const roiArray = points.map(p => [p.x, p.y]);
    
    try {
      await authFetch(`/api/cameras/${camera.camera_id}/roi`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roi_polygon: JSON.stringify(roiArray) }),
      });
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Failed to save ROI:', error);
      alert('Failed to save ROI region');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !camera) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 rounded-2xl shadow-2xl w-full max-w-4xl border border-slate-800 overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 text-blue-400 rounded-lg">
              <Camera size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white leading-tight">ROI Editor</h2>
              <p className="text-xs text-slate-400">Camera: {camera.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Editor Area */}
        <div className="p-6 flex gap-6 bg-slate-950">
          {/* Main View */}
          <div className="flex-1 flex flex-col gap-4">
            <div 
              ref={containerRef}
              className="relative w-full aspect-video bg-black rounded-lg overflow-hidden border border-slate-800 cursor-crosshair shadow-inner"
            >
              {/* Fake Video Feed (Could be real MJPEG later) */}
              <div className="absolute inset-0 flex items-center justify-center text-slate-800 font-mono text-sm pointer-events-none">
                [LIVE FEED PLACEHOLDER]
              </div>

              {/* Drawing Layer */}
              <svg 
                className="absolute inset-0 w-full h-full" 
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                onClick={handleSvgClick}
              >
                {/* Draw lines between points */}
                {points.length > 1 && (
                  <polygon
                    points={points.map(p => `${p.x * 100} ${p.y * 100}`).join(', ')}
                    fill="rgba(59, 130, 246, 0.2)"
                    stroke="rgba(59, 130, 246, 0.8)"
                    strokeWidth="1"
                    strokeDasharray="2 2"
                    vectorEffect="non-scaling-stroke"
                    className="pointer-events-none animate-pulse"
                  />
                )}
                
                {/* Draw points */}
                {points.map((p, i) => (
                  <circle
                    key={i}
                    cx={p.x * 100}
                    cy={p.y * 100}
                    r="1"
                    fill="#3b82f6"
                    stroke="#ffffff"
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                    className="pointer-events-none"
                  />
                ))}
              </svg>
            </div>
            
            <p className="text-xs text-slate-500 text-center font-medium">
              Click on the feed to draw the Region of Interest (ROI) polygon. The AI will only analyze movement inside this area.
            </p>
          </div>

          {/* Tools Panel */}
          <div className="w-64 flex flex-col gap-4">
            <div className="bg-slate-900 rounded-xl p-4 border border-slate-800 flex flex-col gap-3">
              <h3 className="text-sm font-bold text-slate-300 mb-1 uppercase tracking-wider">Tools</h3>
              
              <button 
                onClick={handleUndo}
                disabled={points.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                <Undo size={16} /> Undo Last Point
              </button>
              
              <button 
                onClick={handleClear}
                disabled={points.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-red-400 rounded-lg hover:bg-slate-800/80 hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                <Trash2 size={16} /> Clear Polygon
              </button>
            </div>

            <div className="mt-auto">
              <button
                onClick={handleSave}
                disabled={isSaving || points.length < 3}
                className="w-full flex justify-center items-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-semibold shadow-lg shadow-blue-900/50"
              >
                {isSaving ? (
                  <><Loader2 size={18} className="animate-spin" /> Saving...</>
                ) : (
                  <><Save size={18} /> Save ROI Data</>
                )}
              </button>
              {points.length > 0 && points.length < 3 && (
                <p className="text-xs text-red-400 text-center mt-3">A polygon requires at least 3 points.</p>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
