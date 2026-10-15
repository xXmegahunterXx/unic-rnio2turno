/**
 * "Palpite oferecido por" na página /palpite: reaproveita o formato 'teste' (contrato inalterado, src/shared/anuncios.ts)
 * e a peça do Teste Cego (`OferecimentoTestePeca`) com outro rótulo. Mesma regra de posição: a marca fica com a
 * ferramenta (o Palpite), nunca com o palpite de alguém — o bloco vai no FIM da página, depois de "Como funciona",
 * longe do divisor e dos números, com borda própria. Impressão visível e clique medidos como 'teste' (UTM `conteudo`:
 * não conta ao anunciante que a visita fez um palpite).
 */
import { useAnunciosDaPagina } from './contexto';
import { OferecimentoTestePeca } from './Oferecimento';

export function OferecimentoPalpite({ className }: { className?: string }) {
  const { escolha, vista, semProvedor, pronto } = useAnunciosDaPagina();
  if (semProvedor || !pronto || !escolha.teste) return null;
  return <OferecimentoTestePeca anuncio={escolha.teste} vista={vista} rotulo="Palpite oferecido por" className={className} />;
}
