import React, { useState } from 'react';
import { motion } from 'motion/react';
import { QrCode, Download, Printer, Copy, Check, ExternalLink, RefreshCw, CheckCircle2 } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { GlassCard, NeonButton } from './UI';

export interface PatientRecordQRViewProps {
  title?: string;
  subtitle?: string;
  recordUrl: string;
  patientName: string;
  patientId?: string | number;
  recordType: 'prescription' | 'vitals';
  date?: string;
  onNewAction: () => void;
  newActionLabel?: string;
  onFinish?: () => void;
}

export const PatientRecordQRView: React.FC<PatientRecordQRViewProps> = ({
  title,
  subtitle,
  recordUrl,
  patientName,
  patientId,
  recordType,
  date = new Date().toLocaleDateString(),
  onNewAction,
  newActionLabel = recordType === 'prescription' ? 'New Scan' : 'New Intake',
  onFinish
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(recordUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const canvas = document.getElementById('record-qr-canvas') as HTMLCanvasElement;
    if (canvas) {
      const url = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `ClinIQ_QR_${patientName.replace(/\s+/g, '_')}_${Date.now()}.png`;
      link.href = url;
      link.click();
    }
  };

  const handlePrint = () => {
    const canvas = document.getElementById('record-qr-canvas') as HTMLCanvasElement;
    const qrImgUrl = canvas ? canvas.toDataURL('image/png') : '';
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      window.print();
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>ClinIQ AI Patient Card - ${patientName}</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              padding: 40px;
              color: #09090b;
              display: flex;
              justify-content: center;
              background-color: #fff;
            }
            .card {
              border: 2px solid #10b981;
              border-radius: 16px;
              padding: 28px;
              width: 380px;
              text-align: center;
              box-shadow: 0 4px 20px rgba(0,0,0,0.08);
            }
            .header {
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 8px;
              font-size: 20px;
              font-weight: 800;
              color: #059669;
              margin-bottom: 4px;
            }
            .badge {
              display: inline-block;
              font-size: 10px;
              text-transform: uppercase;
              letter-spacing: 1px;
              background: #ecfdf5;
              color: #047857;
              padding: 4px 10px;
              border-radius: 9999px;
              margin-bottom: 18px;
              font-weight: 700;
            }
            .qr-wrapper {
              margin: 0 auto 16px;
              padding: 12px;
              background: #ffffff;
              display: inline-block;
              border-radius: 12px;
              border: 1px solid #e5e7eb;
            }
            .patient-name {
              font-size: 18px;
              font-weight: 700;
              margin: 0 0 4px 0;
            }
            .info-row {
              font-size: 12px;
              color: #4b5563;
              margin-bottom: 4px;
            }
            .url {
              font-family: monospace;
              font-size: 9px;
              word-break: break-all;
              color: #6b7280;
              margin-top: 14px;
              padding: 8px;
              background: #f9fafb;
              border-radius: 6px;
            }
            .footer {
              margin-top: 18px;
              font-size: 10px;
              color: #9ca3af;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="header">ClinIQ AI</div>
            <div class="badge">Verified Digital Health Card</div>
            <div class="qr-wrapper">
              <img src="${qrImgUrl}" width="220" height="220" alt="QR Code" />
            </div>
            <div class="patient-name">${patientName}</div>
            ${patientId ? `<div class="info-row">Patient ID: <strong>#${patientId}</strong></div>` : ''}
            <div class="info-row">Type: <strong>${recordType === 'prescription' ? 'Doctor Prescription' : 'Nurse Intake & Vitals'}</strong></div>
            <div class="info-row">Date: <strong>${date}</strong></div>
            <div class="url">${recordUrl}</div>
            <div class="footer">Scan with any smartphone camera • Government of Maharashtra</div>
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const defaultTitle = recordType === 'prescription' 
    ? 'Patient QR Code Generated' 
    : 'Patient Intake QR Generated';

  const defaultSubtitle = recordType === 'prescription'
    ? 'Scan this QR to view your digital prescription'
    : 'Scan this QR to view your verified vitals and intake record';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="max-w-xl mx-auto text-center space-y-6"
    >
      <div className="flex flex-col items-center">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-4 border border-emerald-500/30 text-emerald-400">
          <QrCode size={34} />
        </div>
        <h2 className="text-2xl font-bold text-virtual-text">{title || defaultTitle}</h2>
        <p className="text-virtual-text-muted max-w-md mt-1 text-sm">
          {subtitle || defaultSubtitle}
        </p>
        <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
          <CheckCircle2 size={13} />
          <span>Patient: {patientName} {patientId ? `(#${patientId})` : ''}</span>
        </div>
      </div>

      <div className="p-6 bg-white rounded-3xl inline-block shadow-xl shadow-black/20 border border-zinc-200">
        <QRCodeCanvas 
          id="record-qr-canvas"
          value={recordUrl}
          size={240}
          level="H"
          includeMargin={true}
        />
      </div>

      {/* Direct link preview */}
      <GlassCard className="p-4 text-left border-virtual-border bg-virtual-input-bg/40">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] uppercase tracking-wider text-virtual-text-muted font-semibold">
            Direct Link Preview
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1 text-xs text-virtual-accent hover:text-emerald-300 transition-all"
            >
              {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
              <span>{copied ? 'Copied!' : 'Copy Link'}</span>
            </button>
            <a
              href={recordUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-virtual-text-muted hover:text-virtual-text transition-all"
              title="Open link in new tab"
            >
              <ExternalLink size={13} />
              <span>Open</span>
            </a>
          </div>
        </div>
        <div className="font-mono text-xs text-virtual-text truncate p-2 rounded-lg bg-black/20 border border-virtual-border/50">
          {recordUrl}
        </div>
      </GlassCard>

      {/* Action buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-lg mx-auto pt-2">
        <NeonButton onClick={handlePrint} variant="outline" className="border-virtual-accent/40 text-virtual-accent">
          <Printer size={16} className="mr-1.5" /> Print QR Card
        </NeonButton>
        <NeonButton onClick={handleDownload} variant="outline" className="border-virtual-border text-virtual-text">
          <Download size={16} className="mr-1.5" /> Download QR
        </NeonButton>
        <NeonButton onClick={onNewAction} className="col-span-2 sm:col-span-1">
          <RefreshCw size={16} className="mr-1.5" /> {newActionLabel}
        </NeonButton>
      </div>

      {onFinish && (
        <div className="pt-2">
          <button
            onClick={onFinish}
            className="text-xs text-virtual-text-muted hover:text-virtual-text underline transition-all"
          >
            Done & Return to Dashboard
          </button>
        </div>
      )}
    </motion.div>
  );
};
