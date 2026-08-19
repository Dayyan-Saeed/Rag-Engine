import os
import docx
from pypdf import PdfReader
from typing import List, Tuple
from dataclasses import dataclass
from uuid import uuid4

from langchain_text_splitters import RecursiveCharacterTextSplitter
import tiktoken

from app.core.config import settings


@dataclass
class DocumentChunk:
    content: str
    chunk_index: int
    page_number: int | None
    char_start: int
    char_end: int
    token_count: int


class DocumentProcessor:
    def __init__(self):
        self.encoding = tiktoken.get_encoding("cl100k_base")
        self.splitter = RecursiveCharacterTextSplitter(
            chunk_size=settings.CHUNK_SIZE,
            chunk_overlap=settings.CHUNK_OVERLAP,
            length_function=self._count_tokens,
            separators=["\n\n", "\n", ". ", " ", ""],
        )

    def _count_tokens(self, text: str) -> int:
        return len(self.encoding.encode(text))

    def extract_text(self, file_path: str, mime_type: str) -> Tuple[str, int]:
        """Extract text from file. Returns (text, page_count)."""
        if mime_type == "application/pdf":
            return self._extract_pdf(file_path)
        elif mime_type == "text/plain" or file_path.endswith(".md"):
            return self._extract_text_file(file_path)
        elif mime_type in [
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ] or file_path.endswith(".docx"):
            return self._extract_docx(file_path)
        else:
            raise ValueError(f"Unsupported file type: {mime_type}")

    def _extract_pdf(self, file_path: str) -> Tuple[str, int]:
        reader = PdfReader(file_path)
        text_parts = []
        page_count = len(reader.pages)

        for page_num, page in enumerate(reader.pages):
            text = page.extract_text()
            if text and text.strip():
                text_parts.append(f"[Page {page_num + 1}]\n{text}")

        return "\n\n".join(text_parts), page_count

    def _extract_text_file(self, file_path: str) -> Tuple[str, int]:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
        return content, 1

    def _extract_docx(self, file_path: str) -> Tuple[str, int]:
        doc = docx.Document(file_path)
        text_parts = []
        for para in doc.paragraphs:
            if para.text.strip():
                text_parts.append(para.text)
        return "\n\n".join(text_parts), 1

    def chunk_text(
        self, text: str, page_map: List[Tuple[int, int, int]] | None = None
    ) -> List[DocumentChunk]:
        """
        Split text into chunks with metadata.
        page_map: list of (page_num, char_start, char_end) for each page
        """
        chunks = self.splitter.split_text(text)
        result = []

        for idx, chunk in enumerate(chunks):
            # Find page number for this chunk
            page_num = None
            char_start = text.find(chunk)
            char_end = char_start + len(chunk)

            if page_map:
                for pn, start, end in page_map:
                    if char_start >= start and char_end <= end:
                        page_num = pn
                        break

            token_count = self._count_tokens(chunk)

            result.append(
                DocumentChunk(
                    content=chunk,
                    chunk_index=idx,
                    page_number=page_num,
                    char_start=char_start,
                    char_end=char_end,
                    token_count=token_count,
                )
            )

        return result

    def process_file(self, file_path: str, mime_type: str) -> Tuple[str, int, List[DocumentChunk]]:
        """Process file and return (full_text, page_count, chunks)."""
        text, page_count = self.extract_text(file_path, mime_type)
        chunks = self.chunk_text(text)
        return text, page_count, chunks


def get_document_processor() -> DocumentProcessor:
    return DocumentProcessor()