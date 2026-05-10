import { useState, useEffect } from 'react';

/**
 * LusinPcsInput — Dual input: Lusin + Pcs
 * Stores value in PCS internally.
 * Usage: <LusinPcsInput value={qty_pcs} onChange={setPcs} disabled={false} />
 */
export default function LusinPcsInput({ value = 0, onChange, disabled = false, max = null, className = '' }) {
  const lusinVal = Math.floor(value / 12);
  const sisaVal  = value % 12;

  function handleLusin(e) {
    const rawValue = e.target.value;
    // Allow empty or typing state, but normalize on value change
    if (rawValue === '') {
      onChange(sisaVal); // Reset to just sisa
      return;
    }
    const l = Math.max(0, parseInt(rawValue, 10) || 0);
    const total = l * 12 + sisaVal;
    if (max !== null && total > max) return;
    onChange(total);
  }

  function handleSisa(e) {
    const rawValue = e.target.value;
    // Allow empty or typing state
    if (rawValue === '') {
      onChange(lusinVal * 12); // Reset to just lusin
      return;
    }
    const s = Math.max(0, Math.min(11, parseInt(rawValue, 10) || 0));
    const total = lusinVal * 12 + s;
    if (max !== null && total > max) return;
    onChange(total);
  }

  const total = value;
  const overMax = max !== null && total > max;

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={0}
          value={lusinVal}
          onChange={handleLusin}
          onBlur={(e) => {
            // Remove leading zeros on blur
            const normalized = parseInt(e.target.value, 10) || 0;
            if (e.target.value !== String(normalized)) {
              handleLusin({ target: { value: String(normalized) } });
            }
          }}
          disabled={disabled}
          className={`w-14 text-center border rounded-md px-1.5 py-1.5 text-sm font-mono
            focus:outline-none focus:ring-2 focus:ring-primary/40
            ${disabled ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-background'}
            ${overMax ? 'border-destructive' : 'border-input'}`}
          data-testid="lusin-input"
        />
        <span className="text-xs text-muted-foreground font-medium">lsn</span>
      </div>
      <span className="text-muted-foreground/60">+</span>
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={0}
          max={11}
          value={sisaVal}
          onChange={handleSisa}
          onBlur={(e) => {
            // Remove leading zeros on blur
            const normalized = parseInt(e.target.value, 10) || 0;
            if (e.target.value !== String(normalized)) {
              handleSisa({ target: { value: String(normalized) } });
            }
          }}
          disabled={disabled}
          className={`w-12 text-center border rounded-md px-1.5 py-1.5 text-sm font-mono
            focus:outline-none focus:ring-2 focus:ring-primary/40
            ${disabled ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-background'}
            ${overMax ? 'border-destructive' : 'border-input'}`}
          data-testid="pcs-extra-input"
        />
        <span className="text-xs text-muted-foreground font-medium">pcs</span>
      </div>
      <span className={`text-xs font-mono ml-1 px-1.5 py-0.5 rounded
        ${overMax ? 'text-destructive bg-destructive/10' : 'text-primary bg-primary/10'}`}>
        = {total} pcs
      </span>
      {max !== null && (
        <span className="text-[10px] text-muted-foreground">max {max}</span>
      )}
    </div>
  );
}
