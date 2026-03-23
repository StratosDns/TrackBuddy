import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TrackBuddy – Food & Macro Tracker',
  description: 'Track your meals, macros, and weight progress',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-gray-50 text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
