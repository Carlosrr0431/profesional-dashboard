'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const ToastContext = createContext(null);

const TYPE_STYLES = {
  success: 'toast-success',
  error: 'toast-error',
  warning: 'toast-warning',
  info: 'toast-info',
};

const TYPE_ICONS = {
  success: '✓',
  error: '✕',
  warning: '!',
  info: 'i',
};

function ToastStack({ toasts, onDismiss, position = 'default' }) {
  if (toasts.length === 0) return null;

  const containerClass = position === 'bottom-center'
    ? 'toast-container toast-container--bottom-center'
    : 'toast-container';

  return (
    <div className={containerClass} aria-live="polite" aria-relevant="additions">
      {toasts.map((item) => (
        <div
          key={item.id}
          className={`toast-item ${TYPE_STYLES[item.type] || TYPE_STYLES.info}`}
          role="status"
        >
          <span className="toast-icon">{TYPE_ICONS[item.type] || TYPE_ICONS.info}</span>
          <p className="toast-message">{item.message}</p>
          <button
            type="button"
            className="toast-close"
            onClick={() => onDismiss(item.id)}
            aria-label="Cerrar notificación"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

function ToastContainer({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;

  const defaultToasts = toasts.filter((item) => item.position !== 'bottom-center');
  const bottomCenterToasts = toasts.filter((item) => item.position === 'bottom-center');

  return (
    <>
      <ToastStack toasts={defaultToasts} onDismiss={onDismiss} />
      <ToastStack toasts={bottomCenterToasts} onDismiss={onDismiss} position="bottom-center" />
    </>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());

  const dismiss = useCallback((id) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback((message, options = {}) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const type = options.type || 'info';
    const duration = options.duration ?? 4000;

    const position = options.position === 'bottom-center' ? 'bottom-center' : 'default';
    setToasts((prev) => [...prev.slice(-4), { id, message, type, position }]);

    if (duration > 0) {
      const timer = setTimeout(() => dismiss(id), duration);
      timersRef.current.set(id, timer);
    }

    return id;
  }, [dismiss]);

  const value = useMemo(() => ({
    toast,
    success: (message, options) => toast(message, { ...options, type: 'success' }),
    error: (message, options) => toast(message, { ...options, type: 'error' }),
    warning: (message, options) => toast(message, { ...options, type: 'warning' }),
    info: (message, options) => toast(message, { ...options, type: 'info' }),
    dismiss,
  }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast debe usarse dentro de ToastProvider');
  }
  return context;
}
