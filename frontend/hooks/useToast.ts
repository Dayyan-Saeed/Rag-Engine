import { useState } from 'react';

export interface Toast {
  id: string;
  title?: string;
  description: string;
  type?: 'success' | 'error' | 'info';
}

// Use react-hot-toast for toast notifications
// This hook provides access to toast state and methods
export function useToast() {
  const [toasts, setToasts] = useState<{ id: string; type: Toast['type']; message: string }[]>([]);

  const addToast = (type: Toast['type'], message: string) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return { toasts, addToast, removeToast };
}