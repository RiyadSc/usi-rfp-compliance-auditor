import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'USI RFP Compliance Auditor — Demo',
  description:
    'Evidence-first RFP review demo. Decision support only; not legal, insurance, or contractual advice.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div
          role="note"
          aria-label="Demo environment notice"
          className="bg-amber-100 text-amber-900 text-center text-sm py-1 border-b border-amber-300"
        >
          DEMO — synthetic/public data only. Outputs are decision support, not legal, insurance, or
          contractual advice.
        </div>
        {children}
      </body>
    </html>
  );
}
