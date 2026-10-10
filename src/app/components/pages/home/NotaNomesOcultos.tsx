/**
 * Nota "Nomes ocultos na simulação" da Home: usa o componente do kit (src/app/components/apuracao/NomesOcultos.tsx).
 */
import { NomesOcultos } from '@/app/components/apuracao/NomesOcultos';

export function NotaNomesOcultos({ className }: { className?: string }) {
  return <NomesOcultos chip className={className} />;
}
