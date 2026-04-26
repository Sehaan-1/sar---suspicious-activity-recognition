import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Camera, X, Loader2, ServerCrash, CheckCircle2 } from 'lucide-react';
import { authFetch } from '../lib/auth';
import { cn } from '../lib/utils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type FormData = {
  name: string;
  source_url: string;
  location: string;
};

export default function AddCameraModal({ isOpen, onClose, onSuccess }: Props) {
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors }, reset } = useForm<FormData>();

  const onSubmit = async (data: FormData) => {
    setIsVerifying(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await authFetch('/api/cameras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const responseData = await res.json();

      if (!res.ok) {
        throw new Error(responseData.error || 'Failed to add camera');
      }

      setSuccessMsg('Camera added and stream verified!');
      reset();
      
      // Delay closing to show success state briefly
      setTimeout(() => {
        onSuccess();
        onClose();
        setSuccessMsg(null);
      }, 1500);

    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsVerifying(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
              <Camera size={20} />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Add New Camera</h2>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-5">
          
          {/* Status Messages */}
          {errorMsg && (
            <div className="flex items-start gap-2 p-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg">
              <ServerCrash size={16} className="mt-0.5 shrink-0" />
              <p>{errorMsg}</p>
            </div>
          )}
          {successMsg && (
            <div className="flex items-start gap-2 p-3 text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
              <p>{successMsg}</p>
            </div>
          )}

          {/* Name Field */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Camera Name</label>
            <input
              {...register('name', { required: 'Name is required', minLength: { value: 2, message: 'Minimum 2 characters' } })}
              placeholder="e.g. Main Lobby Gate"
              className={cn(
                "w-full px-4 py-2.5 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2",
                errors.name 
                  ? "border-red-300 focus:border-red-500 focus:ring-red-500/20" 
                  : "border-slate-200 focus:border-blue-500 focus:ring-blue-500/20"
              )}
            />
            {errors.name && <p className="mt-1.5 text-xs text-red-500">{errors.name.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Stream Source</label>
            <input
              {...register('source_url', { 
                required: 'Stream source is required',
              })}
              placeholder="rtsp://admin:pass@192.168.1.100/stream  |  http://...  |  0 (webcam)"
              className={cn(
                "w-full px-4 py-2.5 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2",
                errors.source_url 
                  ? "border-red-300 focus:border-red-500 focus:ring-red-500/20" 
                  : "border-slate-200 focus:border-blue-500 focus:ring-blue-500/20"
              )}
            />
            <p className="mt-1.5 text-xs text-slate-400">Accepts RTSP, HTTP/HTTPS URLs, or a local webcam index (e.g. <code>0</code>)</p>
            {errors.source_url && <p className="mt-1 text-xs text-red-500">{errors.source_url.message}</p>}
          </div>

          {/* Location Field */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Location (Optional)</label>
            <input
              {...register('location')}
              placeholder="e.g. Building A, Floor 1"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm transition-all focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          {/* Footer */}
          <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isVerifying}
              className="px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isVerifying}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-md shadow-blue-500/20 disabled:opacity-70"
            >
              {isVerifying ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Verifying Stream...
                </>
              ) : (
                'Save Camera'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
