'use client';

import { useState, useRef } from 'react';
import { Document } from '@/lib/types';
import { documentApi } from '@/lib/api';
import { X, FileText, Upload, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'react-hot-toast';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const ALLOWED_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const MAX_SIZE = 50 * 1024 * 1024; // 50MB

interface UploadFile {
  file: File;
  id: string;
  progress: number;
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error';
  error?: string;
  document?: Document;
}

export function UploadModal({ isOpen, onClose, onSuccess }: UploadModalProps) {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return 'File type not supported. Allowed: PDF, TXT, MD, DOCX';
    }
    if (file.size > MAX_SIZE) {
      return 'File size exceeds 50MB limit';
    }
    return null;
  };

  const handleFiles = (newFiles: FileList | File[]) => {
    const validFiles: UploadFile[] = [];
    Array.from(newFiles).forEach((file) => {
      const error = validateFile(file);
      if (error) {
        toast.error(`${file.name}: ${error}`);
        return;
      }
      validFiles.push({
        file,
        id: Math.random().toString(36).substr(2, 9),
        progress: 0,
        status: 'pending',
      });
    });
    setFiles((prev) => [...prev, ...validFiles]);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const uploadFile = async (uploadFile: UploadFile) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === uploadFile.id ? { ...f, status: 'uploading' as const } : f))
    );

    try {
      const response = await documentApi.upload(uploadFile.file, (progress) => {
        setFiles((prev) =>
          prev.map((f) => (f.id === uploadFile.id ? { ...f, progress } : f))
        );
      });

      const document = response.data;
      setFiles((prev) =>
        prev.map((f) =>
          f.id === uploadFile.id
            ? { ...f, progress: 100, status: 'processing' as const, document }
            : f
        )
      );

      // Poll for completion
      await pollDocumentStatus(document.id, uploadFile.id);
    } catch (error) {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === uploadFile.id
            ? { ...f, status: 'error' as const, error: 'Upload failed' }
            : f
        )
      );
    }
  };

  const pollDocumentStatus = async (docId: string, fileId: string) => {
    const maxAttempts = 60;
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const response = await documentApi.getStatus(docId);
        const status = response.data;

        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileId
              ? {
                  ...f,
                  progress: status.progress ? Math.round(status.progress * 100) : f.progress,
                  status: status.status === 'completed' ? 'completed' : 'processing',
                  error: status.error_message,
                  document: status.status === 'completed' ? { ...f.document!, ...status } : f.document,
                }
              : f
          )
        );

        if (status.status === 'completed') {
          toast.success(`${files.find((f) => f.id === fileId)?.file.name} ready`);
          onSuccess();
          return;
        }
        if (status.status === 'failed') {
          throw new Error(status.error_message || 'Processing failed');
        }
      } catch (error) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileId
              ? { ...f, status: 'error', error: error instanceof Error ? error.message : 'Failed' }
              : f
          )
        );
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
      attempts++;
    }
  };

  const handleUploadAll = () => {
    files.filter((f) => f.status === 'pending').forEach(uploadFile);
  };

  const handleClearCompleted = () => {
    setFiles((prev) => prev.filter((f) => f.status !== 'completed'));
  };

  if (!isOpen) return null;

  const hasPending = files.some((f) => f.status === 'pending');
  const hasUploading = files.some((f) => f.status === 'uploading' || f.status === 'processing');
  const allCompleted = files.length > 0 && files.every((f) => f.status === 'completed');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-2xl bg-white dark:bg-gray-800 rounded-xl shadow-xl max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Upload Documents</h2>
          <button
            onClick={onClose}
            disabled={hasUploading}
            className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drop zone / File list */}
        <div className="p-4 max-h-[60vh] overflow-y-auto">
          {files.length === 0 ? (
            <div
              className={cn(
                'border-2 border-dashed rounded-lg p-8 text-center transition-colors',
                isDragging
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                  : 'border-gray-300 dark:border-gray-600'
              )}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.txt,.md,.docx"
                onChange={(e) => e.target.files && handleFiles(e.target.files)}
                className="hidden"
              />
              <Upload className="w-12 h-12 mx-auto text-gray-400 dark:text-gray-500 mb-4" />
              <p className="text-gray-600 dark:text-gray-400 mb-2">
                Drag & drop files here, or click to browse
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-500">
                PDF, TXT, MD, DOCX • Max 50MB each
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {files.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                >
                  <FileText className="w-8 h-8 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {f.file.name}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary-600 transition-all duration-300"
                          style={{ width: `${f.progress}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 dark:text-gray-400 w-10 text-right">
                        {f.progress}%
                      </span>
                    </div>
                    {f.error && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">{f.error}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {f.status === 'pending' && (
                      <button
                        onClick={() => uploadFile(f)}
                        className="px-3 py-1 text-xs bg-primary-600 text-white rounded hover:bg-primary-700"
                      >
                        Upload
                      </button>
                    )}
                    {f.status === 'uploading' && (
                      <Loader2 className="w-4 h-4 text-primary-600 animate-spin" />
                    )}
                    {f.status === 'processing' && (
                      <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                    )}
                    {f.status === 'completed' && (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    )}
                    {f.status === 'error' && (
                      <AlertCircle className="w-5 h-5 text-red-500" />
                    )}
                    <button
                      onClick={() => removeFile(f.id)}
                      disabled={f.status === 'uploading' || f.status === 'processing'}
                      className="p-1 text-gray-400 hover:text-red-500 disabled:opacity-50"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}

              {hasPending && (
                <button
                  onClick={handleUploadAll}
                  className="w-full px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                >
                  Upload All ({files.filter((f) => f.status === 'pending').length})
                </button>
              )}

              {allCompleted && (
                <button
                  onClick={handleClearCompleted}
                  className="w-full px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  Clear Completed
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}