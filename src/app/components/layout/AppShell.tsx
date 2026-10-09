// PLACEHOLDER — substituído pelo agente de UI kit (header, faixa de simulação, aviso, rodapé).
import { Outlet } from 'react-router-dom';
export function AppShell() {
  return (
    <div className="min-h-dvh">
      <Outlet />
    </div>
  );
}
