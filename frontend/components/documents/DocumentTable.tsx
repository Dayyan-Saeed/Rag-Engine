'use client';

import { Document } from '@/lib/types';
import { formatFileSize, formatDate, truncate } from '@/lib/utils';
import { FileText, Clock, CheckCircle, XCircle, AlertCircle, Trash2, Search } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';

interface DocumentTableProps {
  documents: Document[];
  onRefresh: () => void;
}

export function DocumentTable({ documents, onRefresh }: DocumentTableProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const router = useRouter();

  const getStatusIcon = (status: Document['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'processing':
        return <Clock className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusLabel = (status: Document['status']) => {
    switch (status) {
      case 'completed':
        return 'Ready';
      case 'processing':
        return 'Processing...';
      case 'failed':
        return 'Failed';
      default:
        return 'Pending';
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;

    setDeletingId(id);
    try {
      await api.delete(`/documents/${id}`);
      toast.success('Document deleted');
      onRefresh();
    } catch (error) {
      toast.error('Failed to delete document');
    } finally {
      setDeletingId(null);
    }
  };

  const handleClick = (doc: Document) => {
    if (doc.status === 'completed') {
      router.push(`/dashboard/search?doc=${doc.id}`);
    }
  };

  if (documents.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-12 text-center">
        <FileText className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No documents yet</h3>
        <p className="text-gray-500 dark:text-gray-400 mb-6">
          Upload your first document to start searching and chatting
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-900/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Document
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Size
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Pages
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Chunks
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Uploaded
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {documents.map((doc) => (
              <tr
                key={doc.id}
                className={doc.status === 'completed' ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50' : ''}
                onClick={() => handleClick(doc)}
              >
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <FileText className="w-8 h-8 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-xs">
                        {doc.original_filename}
                      </p>
                      {doc.error_message && (
                        <p className="text-xs text-red-600 dark:text-red-400 truncate max-w-xs mt-1">
                          {truncate(doc.error_message, 60)}
                        </p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-400">
                  {formatFileSize(doc.file_size)}
                </td>
                <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-400">
                  {doc.page_count}
                </td>
                <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-400">
                  {doc.chunk_count}
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(doc.status)}
                    <span className="text-sm font-medium">
                      {doc.status === 'completed' ? 'Ready' : getStatusLabel(doc.status)}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-400">
                  {formatDate(doc.created_at)}
                </td>
                <td className="px-4 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {doc.status === 'completed' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/dashboard/chat?doc=${doc.id}`);
                        }}
                        className="p-2 text-gray-500 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        title="Chat with this document"
                      >
                        <Search className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(doc.id, doc.original_filename);
                      }}
                      disabled={deletingId === doc.id}
                      className="p-2 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                      title="Delete"
                    >
                      {deletingId === doc.id ? (
                        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}