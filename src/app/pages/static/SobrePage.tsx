/**
 * /sobre — o que é o Sintonia, princípios (neutralidade, precisão, privacidade, beleza), apartidarismo,
 * sem anúncios políticos, equipe (placeholder) e contato (provisório).
 */
import { ButtonLink } from '@/app/ui/Button';
import { Icon, type IconName } from '@/app/ui/Icon';
import {
  CONTATO,
  Destaque,
  Email,
  Lista,
  LinkInterno,
  PaginaInstitucional,
  Resumo,
  Secao,
} from '@/app/components/pages/home/Institucional';

const SUMARIO = [
  { id: 'o-que-e', titulo: 'O que é' },
  { id: 'principios', titulo: 'Princípios' },
  { id: 'apartidario', titulo: 'Apartidário' },
  { id: 'equipe', titulo: 'Equipe' },
  { id: 'contato', titulo: 'Fale com a gente' },
];

const EQUIPE: { area: string; icone: IconName; texto: string }[] = [
  { area: 'Produto e design', icone: 'grade', texto: 'Experiência, visual e acessibilidade.' },
  { area: 'Dados e engenharia', icone: 'grafico', texto: 'Integração com o TSE, mapas e infraestrutura da noite da apuração.' },
  { area: 'Editorial e checagem', icone: 'lista', texto: 'Teste Cego, textos neutros e conferência das fontes.' },
  { area: 'Jurídico eleitoral', icone: 'selo', texto: 'Legislação eleitoral e proteção de dados.' },
];

export default function SobrePage() {
  return (
    <PaginaInstitucional
      tituloAba="Sobre"
      eyebrow="Sobre o Sintonia"
      icone="info"
      titulo="Informar bem, sem torcer"
      lead="O Sintonia é um projeto independente para acompanhar a apuração do 2º turno de 2026 com precisão e clareza, do Brasil inteiro até a sua seção. E para conhecer as propostas pelo que elas dizem, não por quem as assina."
      sumario={SUMARIO}
      destaque={
        <Resumo
          itens={[
            { icone: 'ao-vivo', titulo: 'Apuração ao vivo', texto: 'Presidente e governadores, estado por estado, cidade por cidade e seção por seção, com os dados oficiais do TSE.' },
            { icone: 'olho-fechado', titulo: 'Teste Cego', texto: 'Propostas reais dos programas de governo, sem nome nem partido. Você escolhe e só depois descobre de quem eram.' },
            { icone: 'busca', titulo: 'Sua seção', texto: 'Encontre a urna onde você vota e veja o boletim dela assim que for totalizada.' },
          ]}
        />
      }
    >
      <Secao id="o-que-e" titulo="O que é">
        <p>
          Em 25 de outubro, milhões de brasileiros vão acompanhar a apuração pelo celular. O Sintonia nasceu para que essa experiência seja{' '}
          <strong>rápida, bonita e confiável</strong>: o placar nacional, os 27 estados, os mais de 5.500 municípios e cada uma das seções
          eleitorais, com os números conferidos e explicados.
        </p>
        <p>
          Antes da eleição, o <LinkInterno to="/teste">Teste Cego</LinkInterno> convida a comparar propostas sem saber de quem são, uma forma de
          olhar para ideias antes de nomes. Depois, você pode <strong>desafiar alguém</strong> e ver em quantos temas vocês concordam.
        </p>
      </Secao>

      <Secao id="principios" titulo="Princípios">
        <p>Quando há dúvida, decidimos nesta ordem:</p>
        <Lista
          numerada
          itens={[
            <>
              <strong>Neutralidade.</strong> Cores pela ordem do número na urna, os dois candidatos sempre do mesmo tamanho e na mesma ordem, textos
              descritivos.
            </>,
            <>
              <strong>Precisão.</strong> Percentuais calculados como o TSE calcula, fontes citadas e simulação sempre sinalizada.
            </>,
            <>
              <strong>Beleza.</strong> Informação clara no celular, rápida em qualquer conexão e acessível para todos.
            </>,
          ]}
        />
        <p>
          E a privacidade atravessa tudo: <LinkInterno to="/privacidade">suas respostas nunca saem do seu aparelho</LinkInterno>.
        </p>
      </Secao>

      <Secao id="apartidario" titulo="Apartidário">
        <Lista
          itens={[
            <>Não temos vínculo com candidatos, partidos, coligações ou campanhas, e não recebemos recursos deles.</>,
            <>
              <strong>Não exibimos propaganda política.</strong> Espaços de anúncio, quando houver, aceitam apenas anunciantes não políticos.
            </>,
            <>Não fazemos enquetes nem mostramos preferência de usuários.</>,
            <>Não usamos fotos de candidatos nem imagens geradas por inteligência artificial.</>,
          ]}
        />
        <Destaque icone="info">
          O Sintonia não é um site oficial da Justiça Eleitoral. Os resultados oficiais são os divulgados pelo Tribunal Superior Eleitoral. Saiba como
          trabalhamos na <LinkInterno to="/metodologia">metodologia</LinkInterno>.
        </Destaque>
      </Secao>

      <Secao id="equipe" titulo="Equipe">
        <p>Uma equipe pequena e multidisciplinar. Os nomes serão publicados aqui antes do lançamento.</p>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {EQUIPE.map((e) => (
            <li key={e.area} className="flex items-start gap-3.5 rounded-2xl border border-line bg-surface p-4 shadow-card">
              <span aria-hidden className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-dashed border-line/[2.5] bg-surface-2 text-fg-subtle">
                <Icon name={e.icone} size={19} />
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-fg">{e.area}</p>
                <p className="mt-0.5 text-[13.5px] leading-snug text-fg-muted">{e.texto}</p>
                <p className="mt-1.5 text-[12px] font-medium uppercase tracking-[0.12em] text-fg-subtle">Nome a definir</p>
              </div>
            </li>
          ))}
        </ul>
      </Secao>

      <Secao id="contato" titulo="Fale com a gente">
        <ul className="space-y-2.5">
          <li>
            Geral: <Email endereco={CONTATO.geral} />
          </li>
          <li>
            Imprensa: <Email endereco={CONTATO.imprensa} />
          </li>
          <li>
            Correções: <Email endereco={CONTATO.correcoes} />
          </li>
        </ul>
        <div className="flex flex-col gap-2.5 pt-2 sm:flex-row">
          <ButtonLink to="/apuracao" variant="primary" size="lg" icon="ao-vivo">
            Ir para a apuração
          </ButtonLink>
          <ButtonLink to="/teste" variant="secondary" size="lg" icon="olho-fechado">
            Fazer o Teste Cego
          </ButtonLink>
        </div>
      </Secao>
    </PaginaInstitucional>
  );
}
