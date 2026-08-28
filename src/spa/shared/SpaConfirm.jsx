'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SpaButton } from './ui';

export function SpaConfirmDialog({
  open,
  title,
  body,
  amount,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'primary',
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onCancel?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const confirmVariant = tone === 'danger' ? 'danger' : tone === 'success' ? 'success' : 'primary';

  return (
    <div className="spa-confirm" role="presentation" onClick={onCancel}>
      <div
        className="spa-confirm-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="spa-confirm-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="spa-confirm-title">{title}</h2>
        {amount ? <p className="spa-confirm-amount">{amount}</p> : null}
        {body ? <p className="spa-confirm-body">{body}</p> : null}
        <div className="spa-confirm-actions">
          <SpaButton variant="ghost" onClick={onCancel}>{cancelLabel}</SpaButton>
          <SpaButton variant={confirmVariant} onClick={onConfirm}>
            {confirmLabel}
          </SpaButton>
        </div>
      </div>
    </div>
  );
}

export function useSpaConfirm() {
  const [opts, setOpts] = useState(null);
  const resolver = useRef(null);

  const ask = useCallback((next) => {
    return new Promise((resolve) => {
      resolver.current = resolve;
      setOpts(next || {});
    });
  }, []);

  const settle = useCallback((value) => {
    resolver.current?.(value);
    resolver.current = null;
    setOpts(null);
  }, []);

  const dialog = (
    <SpaConfirmDialog
      open={Boolean(opts)}
      title={opts?.title || '¿Confirmar?'}
      body={opts?.body}
      amount={opts?.amount}
      confirmLabel={opts?.confirmLabel}
      cancelLabel={opts?.cancelLabel}
      tone={opts?.tone}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  );

  return { confirm: ask, dialog };
}
