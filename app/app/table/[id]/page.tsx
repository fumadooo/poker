import { Suspense } from 'react';
import { TableClient } from './TableClient';

// `params` é dado de runtime (cacheComponents): resolvido dentro de um Suspense para não bloquear o shell.
async function TableResolver({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TableClient id={id} />;
}

export default function TablePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center p-8 text-sm text-white/60">Abrindo a mesa…</div>}>
      <TableResolver params={params} />
    </Suspense>
  );
}
