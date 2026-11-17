/**
 * Toast Notification System
 * Clean, modern toast notifications (no AI slop)
 */

import { useEffect, useRef, useState } from 'react';
import { Close } from './Icons';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  duration?: number;
  onClose: () => void;
}

export function Toast({ message, type = 'info', duration = 2000, onClose }: ToastProps) {
  const [isExiting, setIsExiting] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(() => onCloseRef.current(), 300);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(onClose, 300);
  };

  const bgColor = {
    success: 'bg-green-500/20 border-green-500/30',
    error: 'bg-blood/20 border-blood/30',
    info: 'bg-gilt/20 border-gilt/30',
  }[type];

  const textColor = {
    success: 'text-green-300',
    error: 'text-red-300',
    info: 'text-gilt',
  }[type];

  const icon = {
    success: '✓',
    error: '✕',
    info: 'ⓘ',
  }[type];

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border ${bgColor} px-4 py-2 shadow-2xl backdrop-blur-md transition-all duration-300 ${
        isExiting ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
      }`}
      style={{ animation: isExiting ? 'none' : 'slideIn 0.3s ease-out' }}
    >
      <span className={`text-sm font-semibold ${textColor}`}>{icon}</span>
      <span className="text-sm text-bone">{message}</span>
      <button
        onClick={handleClose}
        className="ml-1 -mr-1 rounded-full p-0.5 text-dust transition hover:bg-white/10 hover:text-bone"
        aria-label="Close"
      >
        <Close className="size-3.5" />
      </button>
    </div>
  );
}

interface ToastContainerProps {
  toasts: Array<{ id: string; message: string; type?: 'success' | 'error' | 'info' }>;
  onRemove: (id: string) => void;
}

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-[100] flex flex-col items-center gap-2 px-4 sm:top-24">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => onRemove(toast.id)}
          />
        </div>
      ))}
    </div>
  );
}

// Hook for easy toast management
export function useToast() {
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type?: 'success' | 'error' | 'info' }>>([]);

  const showToast = (message: string, type?: 'success' | 'error' | 'info') => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return { toasts, showToast, removeToast };
}
