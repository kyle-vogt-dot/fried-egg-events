'use client';

import { useRouter } from 'next/navigation';

export default function BackButton({
  className = 'text-gray-400 hover:text-white text-sm mb-8 inline-block',
}: {
  className?: string;
}) {
  const router = useRouter();

  return (
    <button type="button" onClick={() => router.back()} className={className}>
      ← Back
    </button>
  );
}