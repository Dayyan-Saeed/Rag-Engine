'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams, useRouter } from 'next/navigation';
import { Search, X, FileText, Loader2, ChevronDown } from 'lucide-react';
import { searchApi } from '@/lib/api';
import { SearchResponse } from '@/lib/types';
import { formatDate, truncate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { DocumentSelector } from '@/components/search/DocumentSelector';

export default function SearchPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>(
    searchParams.get('doc') ? [searchParams.get('doc')!] : []
  );
  const [showDocSelector, setShowDocSelector] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  // Debounce search query
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout>();

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (searchTimeout) clearTimeout(searchTimeout);
    setSearchTimeout(
      setTimeout(() => {
        setDebouncedQuery(value);
        updateUrl();
      }, 300)
    );
  };

  const updateUrl = () => {
    const params = new URLSearchParams();
    if (debouncedQuery) params.set('q', debouncedQuery);
    if (selectedDocIds.length > 0) params.set('doc', selectedDocIds[0]);
    router.push(`/dashboard/search?${params.toString()}`, { scroll: false });
  };

  const { data, isLoading, error } = useQuery<SearchResponse>({
    queryKey: ['search', debouncedQuery, selectedDocIds],
    queryFn: async () => {
      const response = await searchApi.search(debouncedQuery, {
        top_k: 10,
        min_score: 0.3,
        document_ids: selectedDocIds.length > 0 ? selectedDocIds : undefined,
      });
      return response.data;
    },
    enabled: debouncedQuery.length > 0,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setDebouncedQuery(query);
    updateUrl();
  };

  const handleClear = () => {
    setQuery('');
    setDebouncedQuery('');
    setSelectedDocIds([]);
    router.push('/dashboard/search', { scroll: false });
  };

  const handleDocSelect = (docIds: string[]) => {
    setSelectedDocIds(docIds);
    setShowDocSelector(false);
    updateUrl();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Semantic Search</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Search across your documents using natural language
        </p>
      </div>

      {/* Search form */}
      <form onSubmit={handleSearch} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder="Ask a question or enter keywords..."
              className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          <DocumentSelector
            selectedIds={selectedDocIds}
            onSelect={handleDocSelect}
            isOpen={showDocSelector}
            onOpenChange={setShowDocSelector}
          />

          <button
            type="submit"
            disabled={!debouncedQuery.trim() || isLoading}
            className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Search className="w-5 h-5" />
            )}
            Search
          </button>

          {debouncedQuery && (
            <button
              type="button"
              onClick={handleClear}
              className="px-4 py-3 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </form>

      {/* Results */}
      {debouncedQuery && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">Searching...</p>
            </div>
          ) : error ? (
            <div className="p-8 text-center">
              <p className="text-red-600 dark:text-red-400">Search failed. Please try again.</p>
            </div>
          ) : data?.results.length === 0 ? (
            <div className="p-8 text-center">
              <FileText className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No results found</h3>
              <p className="text-gray-500 dark:text-gray-400">
                Try different keywords or check your document selection
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {data!.results.map((result, index) => (
                <SearchResultCard
                  key={result.id}
                  result={result}
                  index={index + 1}
                  query={debouncedQuery}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SearchResultCard({
  result,
  index,
  query,
}: {
  result: SearchResponse['results'][0];
  index: number;
  query: string;
}) {
  const highlight = (text: string) => {
    const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    let highlighted = text;
    words.forEach((word) => {
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(${escaped})`, 'gi');
      highlighted = highlighted.replace(regex, '<mark class="bg-yellow-200 dark:bg-yellow-800 px-0.5 rounded">$1</mark>');
    });
    return highlighted;
  };

  return (
    <div className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
      <div className="flex items-start gap-3">
        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 text-xs font-bold flex items-center justify-center">
          {index}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
              {result.document_filename}
            </span>
            {result.page_number && (
              <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">
                Page {result.page_number}
              </span>
            )}
            <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">
              Score: {(result.score * 100).toFixed(1)}%
            </span>
          </div>
          <div
            className="text-sm text-gray-600 dark:text-gray-300 line-clamp-3 prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: highlight(truncate(result.content, 500)) }}
          />
        </div>
      </div>
    </div>
  );
}