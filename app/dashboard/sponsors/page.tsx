'use client';
export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import SponsorsContent from './SponsorsContent';   // We'll create this small inner component

export default function SponsorsPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center">Loading sponsors...</div>}>
      <SponsorsContent />
    </Suspense>
  );
}