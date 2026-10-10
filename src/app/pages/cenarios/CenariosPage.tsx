/**
 * /cenarios — "E se…?": calculadora de cenários do 2º turno a partir do resultado oficial do 1º turno.
 * NÃO é pesquisa nem previsão: são as hipóteses de quem usa. (Esqueleto criado pelo orquestrador; a frente
 * "cenários" preenche.)
 */
import { Container } from '@/app/components/layout/Container';
import { PageHeader } from '@/app/components/layout/PageHeader';

export default function CenariosPage() {
  return (
    <Container wide>
      <PageHeader eyebrow="Calculadora · não é pesquisa" title="E se…? Monte seu cenário" subtitle="Em construção." />
    </Container>
  );
}
