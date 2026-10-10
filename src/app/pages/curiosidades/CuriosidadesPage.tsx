/**
 * /curiosidades — "Curiosidades do 1º turno": fatos neutros e verificáveis calculados dos dados oficiais do TSE,
 * cada um com cartão para compartilhar. (Esqueleto criado pelo orquestrador; a frente "curiosidades" preenche.)
 */
import { Container } from '@/app/components/layout/Container';
import { PageHeader } from '@/app/components/layout/PageHeader';

export default function CuriosidadesPage() {
  return (
    <Container wide>
      <PageHeader eyebrow="1º turno · dados oficiais" title="Curiosidades do 1º turno" subtitle="Em construção." />
    </Container>
  );
}
