import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { DashboardProvider } from '@/context/DashboardContext';
import { BootstrapProvider } from '@/context/BootstrapContext';
import AppBootstrap from '@/components/DatasetBootstrap';
import RestoreLoadingOverlay from '@/components/RestoreLoadingOverlay';
import Navbar from '@/components/Navbar';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'AI Analytics',
  description: 'Upload CSV files, auto-detect schemas, and generate AI-powered analytics insights.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <BootstrapProvider>
          <DashboardProvider>
            <AppBootstrap />
            <RestoreLoadingOverlay />
            <Navbar />
            {children}
          </DashboardProvider>
        </BootstrapProvider>
      </body>
    </html>
  );
}
