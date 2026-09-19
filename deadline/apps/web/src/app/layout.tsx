import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DEADLINE — Loot. Survive. Get Out.',
  description:
    'A browser-based multiplayer extraction shooter. Drop into Sector Zero, fill your bag, and reach an exit before the clock runs out.',
  applicationName: 'DEADLINE',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#07090D',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="dl-backdrop min-h-screen bg-void text-ink antialiased">{children}</body>
    </html>
  );
}
