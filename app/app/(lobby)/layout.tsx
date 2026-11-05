import { AuthGate } from '@/components/AuthGate';

export default function LobbyLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
