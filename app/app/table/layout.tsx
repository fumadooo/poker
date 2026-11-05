import { AuthGate } from '@/components/AuthGate';

export default function TableLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
