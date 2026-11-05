'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fmtCents } from '@/lib/client/money';
import { signOut, useSession } from '@/lib/client/useSession';

export function Header({ balance, right }: { balance: number | null; right?: React.ReactNode }) {
  const session = useSession();
  const router = useRouter();
  return (
    <header className="sticky top-0 z-10 border-b border-white/10 bg-[#0b0e0c]/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-3 py-2 sm:px-4">
        <Link href="/" className="flex items-center gap-2 font-black tracking-tight">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gold text-sm text-black">♠</span>
          <span className="hidden sm:inline">POKER</span>
        </Link>
        <div className="ml-auto flex items-center gap-2 text-sm">
          {right}
          <span className="rounded-lg bg-white/5 px-2.5 py-1.5 font-semibold text-gold" title="Saldo (fichas de teste)">
            {balance == null ? '—' : fmtCents(balance)}
          </span>
          <span className="hidden max-w-[160px] truncate text-white/50 md:inline" title={session.email ?? ''}>{session.email}</span>
          <button
            type="button"
            className="btn btn-ghost !px-2.5 !py-1.5 !text-xs"
            onClick={async () => { await signOut(); router.replace('/login'); }}
          >
            Sair
          </button>
        </div>
      </div>
    </header>
  );
}
