import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://left-out-webmcp-security-lab.taitfor.chatgpt.site'),
  title: 'WebMCP Security Lab | Left Out Security',
  description:
    'A controlled test range for comparing the human-visible, agent-declared, and effective behavior of page-scoped WebMCP tools.',
  openGraph: {
    title: 'Left Out Security WebMCP Security Lab',
    description:
      'Trust the effect, not the label. Explore five controlled WebMCP security fixtures with private, exportable evidence.',
    type: 'website',
    url: '/',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'Left Out Security WebMCP Security Lab — Trust the effect, not the label.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Left Out Security WebMCP Security Lab',
    description:
      'Five controlled WebMCP security fixtures with presented, declared, and effective evidence.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
