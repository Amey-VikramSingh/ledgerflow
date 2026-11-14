import './globals.css';
import type { Metadata } from 'next';
import { Providers } from '@/components/providers';

export const metadata: Metadata = {
  title: 'LedgerFlow Console',
  description: 'Operate the ledger — move money, watch it reconcile.',
};

// Fonts loaded at runtime via <link> (Space Grotesk display, IBM Plex Sans UI,
// IBM Plex Mono for figures). CSS variables wire them to the Tailwind theme.
const FONTS =
  'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={FONTS} />
        <style>{`
          :root {
            --font-display: 'Space Grotesk';
            --font-sans: 'IBM Plex Sans';
            --font-mono: 'IBM Plex Mono';
          }
        `}</style>
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
