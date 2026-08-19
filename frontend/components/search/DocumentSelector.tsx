'use client';

import { useQuery } from '@tanstack/react-query';
import { useState, useRef, useEffect } from 'react';
import { documentApi } from '@/lib/api';
import { Document, DocumentListResponse } from '@/lib/types';
import { Check, ChevronDown, ChevronUp, Search, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DocumentSelectorProps {
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DocumentSelector({
  selectedIds,
  onSelect,
  isOpen,
  onOpenChange,
}: DocumentSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const { data: documentsData } = useQuery<DocumentListResponse>({
    queryKey: ['documents'],
    queryFn: async () => {
      const response = await documentApi.list();
      return response.data;
    },
    staleTime: 1000 * 60 * 5,
  });

  const filteredDocs = documentsData?.documents
    ?.filter((d) => d.status === 'completed')
    .filter((d) =>
      d.original_filename.toLowerCase().includes(searchQuery.toLowerCase())
    ) || [];

  const toggleDoc = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelect(selectedIds.filter((s) => s !== id));
    } else {
      onSelect([...selectedIds, id]);
    }
  };

  const selectAll = () => {
    if (selectedIds.length === filteredDocs.length) {
      onSelect([]);
    } else {
      onSelect(filteredDocs.map((d) => d.id));
    }
  };

  const isAllSelected = filteredDocs.length > 0 && selectedIds.length === filteredDocs.length;

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        onOpenChange(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onOpenChange]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => onOpenChange(!isOpen)}
        className={cn(
          'flex items-center gap-2 px-3 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors',
          selectedIds.length > 0 && 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
        )}
        disabled={!documentsData}
      >
        <FileText className="w-4 h-4" />
        <span className="flex-1 truncate">
          {selectedIds.length === 0
            ? 'All documents'
            : `${selectedIds.length} selected`}
        </span>
        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-50 max-h-96 overflow-hidden">
          <div className="p-3 border-b border-gray-200 dark:border-gray-600 flex items-center gap-2">
            <Search className="w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter documents..."
              className="flex-1 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded px-3 py-1.5 text-sm text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div className="max-h-64 overflow-y-auto">
            {filteredDocs.length === 0 ? (
              <div className="p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
                No documents found
              </div>
            ) : (
              <>
                <label className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={selectAll}
                    className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <span className="text-gray-900 dark:text-white">
                    {isAllSelected ? 'Deselect all' : 'Select all'}
                  </span>
                  <span className="text-gray-500 dark:text-gray-400 ml-auto">
                    ({filteredDocs.length})
                  </span>
                </label>
                <div className="border-t border-gray-200 dark:border-gray-600" />
                {filteredDocs.map((doc) => (
                  <label
                    key={doc.id}
                    className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(doc.id)}
                      onChange={() => toggleDoc(doc.id)}
                      className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                    />
                    <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="truncate flex-1 text-gray-900 dark:text-white">
                      {doc.original_filename}
                    </span>
                    {selectedIds.includes(doc.id) && (
                      <Check className="w-4 h-4 text-primary-600 flex-shrink-0" />
                    )}
                  </label>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}