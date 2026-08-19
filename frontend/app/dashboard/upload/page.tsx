'use client';

import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import UploadPageContent from './UploadPageContent';

export default function UploadPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin text-primary-600" /></div>}>
      <UploadPageContent />
    </Suspense>
  );
}