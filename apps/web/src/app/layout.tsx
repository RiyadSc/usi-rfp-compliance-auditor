import type { Metadata } from 'next';
import { Inter, Instrument_Serif } from 'next/font/google';
import type { ReactNode } from 'react';
import { PerformanceBeacon } from '@/components/performance-beacon';
import './globals.css';

// Self-hosted at build time by Next, so no third-party request at runtime.
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const editorial = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-editorial',
});

export const metadata: Metadata = {
  title: 'USI RFP Compliance Auditor — Demo',
  description:
    'Evidence-first RFP review demo. Decision support only; not legal, insurance, or contractual advice.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${editorial.variable}`}>
      <body>
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <PerformanceBeacon />
        <div role="note" aria-label="Demo environment notice" className="demo-strip">
          DEMO — synthetic/public data only. Outputs are decision support, not legal, insurance, or
          contractual advice.
        </div>
        <div id="main-content" tabIndex={-1}>
          {children}
        </div>
      </body>
    </html>
  );
}
