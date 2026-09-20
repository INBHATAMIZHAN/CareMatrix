import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Flame, 
  CheckCircle2, 
  AlertCircle, 
  Copy, 
  ExternalLink, 
  X, 
  RefreshCw, 
  Database, 
  Users, 
  Stethoscope, 
  Calendar, 
  Bell, 
  Heart, 
  Lock, 
  FileText,
  Activity
} from 'lucide-react';
import { GlassCard, NeonButton } from './UI';
import { exportAndSyncAllDataToFirebase, testFirestoreConnection } from '../services/firebase';

interface FirebaseSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  connected: boolean;
  permissionDenied: boolean;
  onSyncSuccess?: (counts: Record<string, number>) => void;
}

export const FirebaseSyncModal: React.FC<FirebaseSyncModalProps> = ({
  isOpen,
  onClose,
  connected: initialConnected,
  permissionDenied: initialPermissionDenied,
  onSyncSuccess
}) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [progress, setProgress] = useState<{ message: string; current: number; total: number; collection?: string } | null>(null);
  const [syncSummary, setSyncSummary] = useState<Record<string, number> | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({
    patients: 413,
    doctors: 40,
    users: 69,
    appointments: 263,
    alerts: 113,
    vitals: 13,
    private_data: 401,
    pending_lab_results: 15
  });
  const [isConnected, setIsConnected] = useState(initialConnected);
  const [isPermDenied, setIsPermDenied] = useState(initialPermissionDenied);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    setIsConnected(initialConnected);
    setIsPermDenied(initialPermissionDenied);
  }, [initialConnected, initialPermissionDenied]);

  // Fetch real counts from local server export endpoint
  useEffect(() => {
    if (isOpen) {
      fetch('/api/firebase/export-all-data')
        .then(res => res.json())
        .then(data => {
          if (data.counts) {
            setCounts(data.counts);
          }
        })
        .catch(() => {
          // fallback to defaults
        });
    }
  }, [isOpen]);

  const testConnection = async () => {
    setIsTesting(true);
    setErrorMsg(null);
    try {
      const res = await testFirestoreConnection();
      setIsConnected(res.connected);
      setIsPermDenied(!!res.permissionDenied);
      if (res.error && res.permissionDenied) {
        setErrorMsg('Firestore connected, but read/write permissions are restricted by your security rules.');
      }
    } finally {
      setIsTesting(false);
    }
  };

  const handleCopyRules = () => {
    const rules = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}`;
    navigator.clipboard.writeText(rules);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleStartSync = async () => {
    setIsSyncing(true);
    setErrorMsg(null);
    setSyncSummary(null);
    setProgress({ message: 'Preparing records for CareMatrix Firebase...', current: 0, total: 100 });

    try {
      const result = await exportAndSyncAllDataToFirebase((status) => {
        setProgress({
          message: status.message,
          current: status.current,
          total: status.total,
          collection: status.collection
        });
      });

      if (result.success) {
        setSyncSummary(result.counts);
        setIsConnected(true);
        setIsPermDenied(false);
        if (onSyncSuccess) onSyncSuccess(result.counts);
      } else {
        if (result.error?.includes('permission') || result.error?.includes('PERMISSION_DENIED')) {
          setIsPermDenied(true);
          setErrorMsg('Permission denied: Please ensure your Firebase Console security rules allow read/write for carematrix-b32f0.');
        } else {
          setErrorMsg(result.error || 'Failed to insert some records into Firebase.');
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'An unexpected error occurred during Firebase migration.');
    } finally {
      setIsSyncing(false);
    }
  };

  if (!isOpen) return null;

  const totalRecords = Object.values(counts).reduce((a: number, b: any) => a + (Number(b) || 0), 0);
  const percentComplete = progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="w-full max-w-2xl my-8"
        >
          <GlassCard className="border-amber-500/40 p-6 shadow-2xl relative overflow-hidden">
            {/* Background Glow */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-virtual-border relative z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                  <Flame size={22} className="animate-pulse" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-virtual-text flex items-center gap-2">
                    CareMatrix Firebase Cloud Sync
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono">
                      carematrix-b32f0
                    </span>
                  </h3>
                  <p className="text-xs text-virtual-text-muted">
                    Switching backend to new Firebase account & syncing all records
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                disabled={isSyncing}
                className="p-1.5 rounded-lg text-virtual-text-muted hover:text-virtual-text hover:bg-virtual-input-bg transition-all"
              >
                <X size={20} />
              </button>
            </div>

            {/* Active Configuration Details */}
            <div className="mt-4 p-3.5 rounded-xl bg-virtual-input-bg border border-virtual-border space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-virtual-text-muted font-medium">Firebase Project ID:</span>
                <span className="font-mono text-amber-400 font-bold">carematrix-b32f0</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-virtual-text-muted font-medium">Auth Domain:</span>
                <span className="font-mono text-virtual-text">carematrix-b32f0.firebaseapp.com</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-virtual-text-muted font-medium">Web App ID:</span>
                <span className="font-mono text-virtual-text text-[11px]">1:463309902822:web:9555cc0379937f49ac7c27</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-virtual-text-muted font-medium">Analytics (Measurement ID):</span>
                <span className="font-mono text-emerald-400">G-TDRDK5WWB3 (Active)</span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-virtual-border/50">
                <span className="text-virtual-text-muted font-medium">Firestore Status:</span>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                    isConnected 
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                      : isPermDenied 
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-red-500/20 text-red-300 border border-red-500/30'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-400' : isPermDenied ? 'bg-amber-400' : 'bg-red-400'}`} />
                    {isConnected ? 'Connected & Ready' : isPermDenied ? 'Awaiting Rules Permission' : 'Reconnecting...'}
                  </span>
                  <button
                    onClick={testConnection}
                    disabled={isTesting}
                    className="p-1 hover:bg-virtual-card-bg rounded text-virtual-text-muted hover:text-virtual-text"
                    title="Re-check connection"
                  >
                    <RefreshCw size={12} className={isTesting ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>
            </div>

            {/* Permission Denied / Firebase Console Rules Helper */}
            {isPermDenied && (
              <div className="mt-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-3">
                <div className="flex items-start gap-2.5">
                  <AlertCircle size={18} className="text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-amber-300">
                      Step to Allow Firestore Data Insertion
                    </h4>
                    <p className="text-[11px] text-amber-200/80 mt-0.5 leading-relaxed">
                      New Firebase projects lock Firestore writes by default. To allow the migration script and web app to insert all 413+ records into <code className="bg-amber-500/20 px-1 py-0.5 rounded text-amber-300">carematrix-b32f0</code>, set your Firestore security rule to allow read/write:
                    </p>
                  </div>
                </div>

                {/* Code Snippet */}
                <div className="relative p-2.5 rounded-lg bg-black/50 border border-amber-500/20 font-mono text-[11px] text-emerald-400">
                  <pre className="overflow-x-auto leading-relaxed">
{`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}`}
                  </pre>
                  <button
                    onClick={handleCopyRules}
                    className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[10px] transition-all"
                  >
                    {copied ? <CheckCircle2 size={12} className="text-emerald-400" /> : <Copy size={12} />}
                    {copied ? 'Copied!' : 'Copy Rule'}
                  </button>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <a
                    href="https://console.firebase.google.com/project/carematrix-b32f0/firestore/rules"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-amber-300 hover:text-amber-200 font-semibold underline underline-offset-2"
                  >
                    Open Firebase Console Rules Tab <ExternalLink size={12} />
                  </a>
                  <button
                    onClick={testConnection}
                    className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-medium transition-all"
                  >
                    Re-test Rules
                  </button>
                </div>
              </div>
            )}

            {/* Error Banner */}
            {errorMsg && !isPermDenied && (
              <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300 flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0 text-red-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Data Breakdown Grid */}
            <div className="mt-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-virtual-text-muted mb-2.5 flex items-center justify-between">
                <span>Data Records Ready to Insert into Firestore</span>
                <span className="text-amber-400 font-bold">{totalRecords} Total Records</span>
              </h4>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="p-2.5 rounded-lg bg-virtual-input-bg border border-virtual-border flex items-center gap-2.5">
                  <Users size={16} className="text-blue-400" />
                  <div>
                    <div className="text-[10px] text-virtual-text-muted">Patients</div>
                    <div className="text-sm font-bold text-virtual-text">{counts.patients || 413}</div>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-virtual-input-bg border border-virtual-border flex items-center gap-2.5">
                  <Stethoscope size={16} className="text-emerald-400" />
                  <div>
                    <div className="text-[10px] text-virtual-text-muted">Doctors</div>
                    <div className="text-sm font-bold text-virtual-text">{counts.doctors || 40}</div>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-virtual-input-bg border border-virtual-border flex items-center gap-2.5">
                  <Calendar size={16} className="text-purple-400" />
                  <div>
                    <div className="text-[10px] text-virtual-text-muted">Appointments</div>
                    <div className="text-sm font-bold text-virtual-text">{counts.appointments || 263}</div>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-virtual-input-bg border border-virtual-border flex items-center gap-2.5">
                  <Bell size={16} className="text-amber-400" />
                  <div>
                    <div className="text-[10px] text-virtual-text-muted">Alerts</div>
                    <div className="text-sm font-bold text-virtual-text">{counts.alerts || 113}</div>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-virtual-input-bg border border-virtual-border flex items-center gap-2.5">
                  <Lock size={16} className="text-rose-400" />
                  <div>
                    <div className="text-[10px] text-virtual-text-muted">Private Vault</div>
                    <div className="text-sm font-bold text-virtual-text">{counts.private_data || 401}</div>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-virtual-input-bg border border-virtual-border flex items-center gap-2.5">
                  <Heart size={16} className="text-red-400" />
                  <div>
                    <div className="text-[10px] text-virtual-text-muted">Vitals</div>
                    <div className="text-sm font-bold text-virtual-text">{counts.vitals || 13}</div>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-virtual-input-bg border border-virtual-border flex items-center gap-2.5">
                  <FileText size={16} className="text-cyan-400" />
                  <div>
                    <div className="text-[10px] text-virtual-text-muted">Staff / Users</div>
                    <div className="text-sm font-bold text-virtual-text">{counts.users || 69}</div>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-virtual-input-bg border border-virtual-border flex items-center gap-2.5">
                  <Activity size={16} className="text-teal-400" />
                  <div>
                    <div className="text-[10px] text-virtual-text-muted">Lab Results</div>
                    <div className="text-sm font-bold text-virtual-text">{counts.pending_lab_results || 15}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Sync Progress Indicator */}
            {isSyncing && progress && (
              <div className="mt-5 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-amber-300">
                  <span className="flex items-center gap-2">
                    <RefreshCw size={13} className="animate-spin text-amber-400" />
                    {progress.message}
                  </span>
                  <span>{percentComplete}%</span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-black/40 overflow-hidden border border-amber-500/20">
                  <div 
                    className="h-full bg-gradient-to-r from-amber-500 to-emerald-400 transition-all duration-300 rounded-full"
                    style={{ width: `${Math.max(percentComplete, 5)}%` }}
                  />
                </div>
                <div className="text-[10px] text-amber-200/70 text-right">
                  {progress.current} of {progress.total} items processed
                </div>
              </div>
            )}

            {/* Success Summary */}
            {syncSummary && (
              <div className="mt-5 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-2">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                  <CheckCircle2 size={18} />
                  <span>All Data Successfully Inserted into Firebase!</span>
                </div>
                <p className="text-xs text-emerald-200/80">
                  CareMatrix project <code className="text-emerald-300 font-mono">carematrix-b32f0</code> has been populated with {syncSummary.patients} patients, {syncSummary.doctors} doctors, {syncSummary.appointments} appointments, and {syncSummary.private_data} vault records.
                </p>
              </div>
            )}

            {/* Action Footer */}
            <div className="mt-6 pt-4 border-t border-virtual-border flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className="text-[11px] text-virtual-text-muted text-center sm:text-left">
                Target: Google Cloud Firestore (<code className="text-amber-400">carematrix-b32f0</code>)
              </span>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={onClose}
                  disabled={isSyncing}
                  className="w-full sm:w-auto px-4 py-2 rounded-xl bg-virtual-input-bg border border-virtual-border text-xs text-virtual-text hover:bg-virtual-card-bg transition-all"
                >
                  Close
                </button>
                <NeonButton
                  onClick={handleStartSync}
                  disabled={isSyncing}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 text-xs py-2 px-4 bg-amber-500 hover:bg-amber-600 text-black font-bold shadow-lg shadow-amber-500/20"
                >
                  {isSyncing ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>Inserting Data...</span>
                    </>
                  ) : (
                    <>
                      <Flame size={14} />
                      <span>{syncSummary ? 'Re-sync All to Firebase' : 'Insert All Data to Firebase Now'}</span>
                    </>
                  )}
                </NeonButton>
              </div>
            </div>
          </GlassCard>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
