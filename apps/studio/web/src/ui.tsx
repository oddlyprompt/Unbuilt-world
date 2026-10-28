import React, { useEffect, useState } from 'react';

export const Badge: React.FC<{ tone?: 'ok' | 'warn' | 'bad' | 'amber' | ''; children: React.ReactNode; title?: string }> = ({ tone = '', children, title }) => (
  <span className={`badge ${tone}`} title={title}>
    {children}
  </span>
);

export const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="field">
    <label>{label}</label>
    {children}
  </div>
);

/** A number input that commits on Enter or blur, so typing "4.5" does not fire a request per keystroke. */
export const NumberInput: React.FC<{ value: number; onCommit: (v: number) => void; step?: number; min?: number; width?: number; testId?: string; disabled?: boolean }> = ({ value, onCommit, step = 0.1, min = 0, width = 70, testId, disabled }) => {
  const [text, setText] = useState(String(+value.toFixed(2)));
  useEffect(() => setText(String(+value.toFixed(2))), [value]);
  const commit = () => {
    const n = Number(text);
    if (Number.isFinite(n) && n >= min && Math.abs(n - value) > 1e-6) onCommit(n);
    else setText(String(+value.toFixed(2)));
  };
  return <input data-testid={testId} disabled={disabled} type="number" step={step} min={min} value={text} style={{ width }} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />;
};

export function useToast() {
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.error ? 9000 : 3500);
    return () => clearTimeout(t);
  }, [toast]);
  const node = toast ? (
    <div className={`toast ${toast.error ? 'error' : ''}`} role="status" data-testid="toast">
      {toast.text}
    </div>
  ) : null;
  return { show: (text: string, error = false) => setToast({ text, error }), node };
}

export const bytes = (n?: number) => (n === undefined ? '' : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

/** Downloads work the same in both modes: fetch through the app's backend layer, then save the blob. */
export const DownloadButton: React.FC<{ path: string; filename: string; children: React.ReactNode; small?: boolean }> = ({ path, filename, children, small }) => (
  <button
    className={`btn${small ? ' small' : ''}`}
    onClick={async () => {
      const r = await fetch(path);
      if (!r.ok) return alert('Download failed.');
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }}
  >
    {children}
  </button>
);

export const DemoNotice: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="issue warning" data-testid="demo-notice" style={{ marginBottom: 14 }}>
    <b>Demo mode.</b> {children} Connect a studio backend (top right) to enable it.
  </div>
);
