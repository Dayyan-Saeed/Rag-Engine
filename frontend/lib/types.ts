export interface Document {
  id: string;
  user_id: string;
  filename: string;
  original_filename: string;
  file_size: number;
  mime_type: string;
  page_count: number;
  chunk_count: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface DocumentListResponse {
  documents: Document[];
  total: number;
  page: number;
  page_size: number;
}

export interface DocumentStatusResponse {
  id: string;
  status: string;
  progress: number | null;
  error_message: string | null;
  chunk_count: number | null;
}

export interface SearchResultChunk {
  id: string;
  document_id: string;
  document_filename: string;
  chunk_index: number;
  content: string;
  page_number: number | null;
  score: number;
}

export interface SearchResponse {
  query: string;
  results: SearchResultChunk[];
  total_results: number;
  took_ms: number;
}

export interface ChatSession {
  id: string;
  user_id: string;
  title: string;
  document_ids: string[];
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  citations: Citation[];
  created_at: string;
}

export interface Citation {
  source_id: number;
  document_id: string;
  filename: string;
  page_number: number | null;
  chunk_index: number;
  score: number;
}

export interface ChatRequest {
  message: string;
  session_id?: string;
  document_ids?: string[];
  stream?: boolean;
}

export interface ChatStreamChunk {
  type: 'token' | 'citation' | 'done' | 'error';
  content: string;
  citations: Citation[];
  session_id?: string;
}