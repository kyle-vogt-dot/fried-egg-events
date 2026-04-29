import type { Metadata } from 'next';
import { Montserrat, Montserrat_Alternates } from 'next/font/google';
import Navigation from './navigation';     // Make sure this line is here

// Use relative path instead of alias for now
import './globals.css';

const montserrat = Montserrat({
  variable: '--font-montserrat',
  subsets: ['latin'],
});

const montserratAlternates = Montserrat_Alternates({
  variable: '--font-montserrat-alternates',
  weight: ['500', '600', '700'],
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Fried Egg Events',
  description: 'Golf Tournaments & Events',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${montserrat.variable} ${montserratAlternates.variable} bg-gray-900 text-white`}>
        <Navigation />
        <main className="min-h-screen">
          {children}
        </main>
      </body>
    </html>
  );
}