import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Clothing Pipeline — AI Clothing Generator',
  description: 'Automated clothing design pipeline powered by AI',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="noise-bg">
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
