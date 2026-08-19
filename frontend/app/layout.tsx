import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'RAG Engine - Semantic Search & Document Q&A',
  description: 'Upload documents, search semantically, and chat with your files',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased bg-gray-50 dark:bg-gray-900`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}