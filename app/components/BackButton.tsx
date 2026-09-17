'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function BackButton({
  href,
  className = 'text-gray-400 hover:text-white text-sm mb-8 inline-block',
}: {
  href?: string;
  className?: string;
}) {
  const router = useRouter();

  if (href) {
    return (
      <Link href={href} className={className}>
        ← Back
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== 'undefined' && window.history.length > 1) {
          router.back();
        } else {
          router.push('/');
        }
      }}
      className={className}
    >
      ← Back
    </button>
  );
}
