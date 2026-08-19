'use client';

import { useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function UploadPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    // Redirect to dashboard with upload modal open
    router.push('/dashboard?upload=true', { scroll: false });
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="animate-pulse text-center">
        <div className="w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-600 dark:text-gray-400">Redirecting to upload...</p>
      </div>
    </div>
  );
}