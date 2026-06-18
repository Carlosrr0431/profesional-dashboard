'use client';

import dynamic from 'next/dynamic';
import { ToastProvider } from '../src/context/ToastContext';

const App = dynamic(() => import('../src/App'), { ssr: false });

export default function Page() {
  return (
    <ToastProvider>
      <App />
    </ToastProvider>
  );
}
