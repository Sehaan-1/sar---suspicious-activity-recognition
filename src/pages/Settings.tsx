import React, { useEffect, useState } from 'react';
import { Save, Server, Cpu, Bell, HardDrive, Shield, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { authFetch } from '../lib/auth';

interface Config {
  loitering_seconds:     number;
  unattended_bag_radius: number;
  pose_estimation:       boolean;
  confidence_threshold:  number;
  tracker:               string;
  yolo_model:            string;
}

const DEFAULTS: Config = {
  loitering_seconds:     60,
  unattended_bag_radius: 2.5,
  pose_estimation:       true,
  confidence_threshold:  75,
  tracker:               'bytetrack',
  yolo_model:            'small',
};

export default function Settings() {
  const [activeTab, setActiveTab] = useState('ai');
  const [config,    setConfig]    = useState<Config>(DEFAULTS);
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);

  // Load persisted config on mount
  useEffect(() => {
    authFetch('/api/config')
      .then(r => r.json())
      .then(data => {
        if (data && Object.keys(data).length > 0) {
          setConfig(prev => ({ ...prev, ...data }));
        }
      })
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await authFetch('/api/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const set = (key: keyof Config, val: Config[keyof Config]) =>
    setConfig(prev => ({ ...prev, [key]: val }));

  const tabs = [
    { id: 'ai',     label: 'AI & Pipeline',   icon: Cpu      },
    { id: 'alerts', label: 'Alert Routing',    icon: Bell     },
    { id: 'system', label: 'System & Storage', icon: HardDrive },
    { id: 'roles',  label: 'Access Control',   icon: Shield   },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">

      {/* Header */}
      <div className="p-6 border-b border-slate-200 bg-white shrink-0 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1 tracking-tight">System Settings</h1>
          <p className="text-sm text-slate-500">Configure AI pipeline thresholds and system preferences.</p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 border border-blue-700 rounded-lg
                     text-sm font-semibold text-white hover:bg-blue-700 transition-colors shadow-sm
                     disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {saving ? (
            <Loader2 size={16} className="animate-spin" />
          ) : saved ? (
            <CheckCircle2 size={16} />
          ) : (
            <Save size={16} />
          )}
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
        </button>
      </div>

      <div className="flex-1 overflow-auto flex">
        {/* Sidebar */}
        <div className="w-64 border-r border-slate-200 bg-white/50 p-6 flex flex-col gap-2 shrink-0">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors w-full text-left",
                  activeTab === tab.id
                    ? "bg-white text-blue-700 shadow-sm border border-slate-200"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent"
                )}
              >
                <Icon size={18} className={activeTab === tab.id ? "text-blue-600" : "text-slate-400"} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 p-8 overflow-auto">
          <div className="max-w-3xl">

            {/* ── AI & Pipeline tab ── */}
            {activeTab === 'ai' && (
              <div className="space-y-8">

                {/* Model Configuration */}
                <div>
                  <h2 className="text-lg font-bold text-slate-900 mb-4 border-b border-slate-200 pb-2">
                    Model Configuration
                  </h2>
                  <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6 shadow-sm">

                    {/* YOLO model */}
                    <div className="space-y-3">
                      <label className="block text-sm font-semibold text-slate-900">Object Detection Model</label>
                      <p className="text-xs text-slate-500">Larger models provide better accuracy but require more GPU VRAM.</p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {[
                          { val: 'nano',   label: 'YOLOv8 Nano (Fastest)' },
                          { val: 'small',  label: 'YOLOv8 Small (Balanced)' },
                          { val: 'medium', label: 'YOLOv8 Medium (Accurate)' },
                        ].map(opt => (
                          <label
                            key={opt.val}
                            className={cn(
                              "flex items-center gap-3 p-4 border rounded-lg cursor-pointer transition-all",
                              config.yolo_model === opt.val
                                ? "border-blue-500 bg-blue-50"
                                : "border-slate-200 hover:border-slate-300 bg-white"
                            )}
                          >
                            <input
                              type="radio"
                              name="model"
                              checked={config.yolo_model === opt.val}
                              onChange={() => set('yolo_model', opt.val)}
                              className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm font-medium text-slate-900">{opt.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Confidence threshold */}
                    <div className="space-y-3 pt-4 border-t border-slate-100">
                      <div className="flex justify-between">
                        <label className="block text-sm font-semibold text-slate-900">Base Confidence Threshold</label>
                        <span className="text-sm font-mono font-bold text-blue-600">
                          {(config.confidence_threshold / 100).toFixed(2)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">Detections below this threshold are discarded before tracking.</p>
                      <input
                        type="range" min="0" max="100"
                        value={config.confidence_threshold}
                        onChange={e => set('confidence_threshold', Number(e.target.value))}
                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                      />
                      <div className="flex justify-between text-xs text-slate-400 font-mono">
                        <span>0.0</span><span>0.5</span><span>1.0</span>
                      </div>
                    </div>

                    {/* Tracker */}
                    <div className="space-y-3 pt-4 border-t border-slate-100">
                      <label className="block text-sm font-semibold text-slate-900">Multi-Object Tracker</label>
                      <select
                        value={config.tracker}
                        onChange={e => set('tracker', e.target.value)}
                        className="w-full sm:w-80 bg-white border border-slate-200 rounded-lg px-4 py-2
                                   text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="bytetrack">ByteTrack (Recommended)</option>
                        <option value="deepsort">DeepSORT</option>
                        <option value="bot-sort">BoT-SORT</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Activity Heuristics */}
                <div>
                  <h2 className="text-lg font-bold text-slate-900 mb-4 border-b border-slate-200 pb-2">
                    Activity Heuristics
                  </h2>
                  <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-sm">

                    <div className="flex items-center justify-between p-4 border border-slate-200 rounded-lg">
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">Loitering Threshold (seconds)</h4>
                        <p className="text-xs text-slate-500">Time an individual must remain stationary before an alert fires.</p>
                      </div>
                      <input
                        type="number" min="5" max="300"
                        value={config.loitering_seconds}
                        onChange={e => set('loitering_seconds', Number(e.target.value))}
                        className="w-20 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2
                                   text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div className="flex items-center justify-between p-4 border border-slate-200 rounded-lg">
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">Unattended Bag Radius (m)</h4>
                        <p className="text-xs text-slate-500">Estimated distance to verify no owner is nearby.</p>
                      </div>
                      <input
                        type="number" min="0.5" max="10" step="0.5"
                        value={config.unattended_bag_radius}
                        onChange={e => set('unattended_bag_radius', Number(e.target.value))}
                        className="w-20 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2
                                   text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div className="flex items-center justify-between p-4 border border-slate-300 bg-slate-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={config.pose_estimation}
                          onChange={e => set('pose_estimation', e.target.checked)}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                        />
                        <div>
                          <h4 className="text-sm font-bold text-slate-900">Enable Experimental Pose Estimation</h4>
                          <p className="text-xs text-slate-500">Activates YOLO-Pose pipeline for fighting detection.</p>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 bg-yellow-100 text-yellow-800 text-[10px] font-bold uppercase rounded border border-yellow-200">
                        Beta
                      </span>
                    </div>

                  </div>
                </div>
              </div>
            )}

            {/* ── Other tabs ── */}
            {(activeTab === 'alerts' || activeTab === 'system' || activeTab === 'roles') && (
              <div className="flex flex-col items-center justify-center h-64 text-slate-400
                              bg-white border border-slate-200 border-dashed rounded-xl">
                <Server size={32} className="mb-3 opacity-30" />
                <h3 className="text-sm font-bold text-slate-700">Module Available in Enterprise Edition</h3>
                <p className="text-xs mt-1">This portfolio build implements AI settings primarily.</p>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
