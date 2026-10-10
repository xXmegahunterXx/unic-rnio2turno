/**
 * Selo "Nomes ocultos na simulação" das páginas de detalhe: usa o componente do kit
 * (src/app/components/apuracao/NomesOcultos.tsx) como pílula ao lado das ações do cabeçalho.
 */
import { NomesOcultos as NomesOcultosKit } from '@/app/components/apuracao/NomesOcultos';

export function NomesOcultos({ className }: { className?: string }) {
  return <NomesOcultosKit chip curto className={className} />;
}
