'use client';

import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { api, documentApi } from '@/lib/api';
import { DocumentListResponse } from '@/lib/types';
import { DocumentTable } from '@/components/documents/DocumentTable';
import { UploadModal } from '@/components/documents/UploadModal';
import { Plus, Search, RefreshCw } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function DashboardPageContent() {
  const searchParams = useSearchParams();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (searchParams.get('upload') === 'true') {
      setUploadOpen(true);
    }
  }, [searchParams]);

  const { data: documentsData, isLoading, error, refetch } = useQuery({
    queryKey: ['documents', refreshKey],
    queryFn: () => documentApi.list(),
    select: (response) => response.data,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Documents</h1>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8">
          <div className="animate-pulse space-y-4">
            <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
            <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
            <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 dark:text-red-400">Failed to load documents</p>
        <button
          onClick={() => refetch()}
          className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const handleUploadComplete = () => {
    setUploadOpen(false);
    setRefreshKey((k) => k + 1);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Documents</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Manage your uploaded documents
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Refresh"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <button
            onClick={() => setUploadOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Upload
          </button>
        </div>
      </div>

      <DocumentTable documents={documentsData?.documents || []} onRefresh={() => setRefreshKey((k) => k + 1)} />

      <UploadModal isOpen={uploadOpen} onClose={() => setUploadOpen(false)} onSuccess={handleUploadComplete} />
    </div>
  );
}