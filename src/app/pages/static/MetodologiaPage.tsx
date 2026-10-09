/**
 * /metodologia — de onde vêm os dados (TSE, IBGE), como funciona a apuração e o "matematicamente eleito",
 * a simulação e como ela é sinalizada, as cores neutras por ordem do número e a metodologia do Teste Cego
 * (documentos-fonte, cálculo, aviso de revisão editorial).
 */
import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { DOCUMENTOS, PROPOSTAS, TEMAS, type Proposta } from '@/app/content/propostas';
import { fmtInt, fmtPct } from '@/shared/format';
import { useMeta } from '@/app/data/hooks';
import { cn } from '@/app/lib/cn';
import { Icon } from '@/app/ui/Icon';
import {
  CONTATO,
  Destaque,
  Email,
  Ficha,
  Lista,
  LinkExterno,
  LinkInterno,
  PaginaInstitucional,
  Secao,
  Subtitulo,
} from '@/app/components/pages/home/Institucional';
import { EM_REVISAO } from '@/app/components/pages/teste/IntroTeste';

const SUMARIO = [
  { id: 'dados', titulo: 'De onde vêm os dados' },
  { id: 'apuracao', titulo: 'Como funciona a apuração' },
  { id: 'eleito', titulo: '“Matematicamente eleito”' },
  { id: 'simulacao', titulo: 'A simulação' },
  { id: 'neutralidade', titulo: 'Cores e neutralidade' },
  { id: 'teste-cego', titulo: 'Teste Cego' },
  { id: 'correcoes', titulo: 'Correções' },
];

export default function MetodologiaPage() {
  const { data: meta } = useMeta();
  const totais = useMemo(() => {
    if (!meta) return null;
    let secoes = 0;
    let eleitorado = 0;
    let municipios = 0;
    let zonas = 0;
    for (const u of meta.ufs) {
      secoes += u.secoes;
      eleitorado += u.eleitorado;
      zonas += u.zonas;
      if (u.uf !== 'ZZ') municipios += u.municipios;
    }
    return { secoes, eleitorado, municipios, zonas };
  }, [meta]);

  return (
    <PaginaInstitucional
      tituloAba="Metodologia"
      eyebrow="Metodologia"
      icone="lista"
      titulo="Como o Sintonia funciona"
      lead="De onde vêm os números, como calculamos cada percentual, como a simulação é sinalizada e como o Teste Cego foi feito. Tudo aberto, para você conferir."
      atualizado="9 de outubro de 2026"
      sumario={SUMARIO}
    >
      <Secao id="dados" titulo="De onde vêm os dados">
        <p>
          Os resultados vêm do <strong>site oficial de divulgação do Tribunal Superior Eleitoral</strong>, os mesmos arquivos públicos que
          alimentam o aplicativo Resultados, da Justiça Eleitoral. Os mapas vêm das <strong>malhas territoriais do IBGE</strong>. Não usamos
          pesquisas, projeções de terceiros nem dados de usuários.
        </p>
        <Ficha
          legenda="Fontes de dados"
          colunas={['Fonte', 'O que usamos', 'Atualização']}
          linhas={[
            [
              <LinkExterno key="tse" href="https://resultados.tse.jus.br" className="whitespace-nowrap">
                TSE · Resultados
              </LinkExterno>,
              '2º turno (25/10) para Presidente e para Governador em 7 estados: totais do país, dos estados, dos municípios e das seções',
              'A cada ~15 s na noite da apuração',
            ],
            ['TSE · 1º turno', 'Resultado oficial final de 4/10, por município, para comparação', 'Fixo (oficial)'],
            [
              'TSE · cadastro de seções',
              totais ? (
                <span key="sec">
                  Estrutura de <span className="num">{fmtInt(totais.secoes)}</span> seções, <span className="num">{fmtInt(totais.zonas)}</span>{' '}
                  zonas e <span className="num">{fmtInt(totais.municipios)}</span> municípios, com o eleitorado de cada um
                </span>
              ) : (
                'Estrutura de seções, zonas e municípios, com o eleitorado de cada um'
              ),
              'Fixo (oficial)',
            ],
            [
              <LinkExterno key="ibge" href="https://www.ibge.gov.br/geociencias/organizacao-do-territorio/malhas-territoriais.html" className="whitespace-nowrap">
                IBGE · Malhas
              </LinkExterno>,
              'Contornos dos estados e municípios, simplificados para carregar rápido no celular',
              'Fixo',
            ],
          ]}
        />
        <p>
          Os municípios do TSE e do IBGE são ligados pelo código oficial de cada um. Todos os horários aparecem no horário de Brasília (UTC−3).
          O Sintonia não é um site oficial da Justiça Eleitoral: em caso de divergência, vale o{' '}
          <LinkExterno href="https://resultados.tse.jus.br">resultado do TSE</LinkExterno>.
        </p>
      </Secao>

      <Secao id="apuracao" titulo="Como funciona a apuração">
        <p>
          A votação do 2º turno vai das 8h às 17h (horário de Brasília). <strong>A divulgação começa às 17h</strong>, quando as urnas de todo o
          país já fecharam. Cada urna imprime o boletim, envia o resultado à Justiça Eleitoral e, depois de conferido, a seção passa a
          contar como <strong>totalizada</strong>.
        </p>
        <Lista
          itens={[
            <>
              <strong>% de seções totalizadas</strong>: seções já contadas sobre o total, com duas casas e <strong>truncado</strong>, como faz o
              TSE. Só aparece 100,00% quando a última seção é totalizada.
            </>,
            <>
              <strong>% de votos válidos</strong>: votos do candidato divididos pela soma dos votos nos candidatos. Brancos e nulos não entram,
              como manda a lei. Os dois percentuais sempre somam 100%.
            </>,
            <>
              <strong>Brancos e nulos</strong> aparecem como % do comparecimento; <strong>abstenção</strong>, como % do eleitorado das seções
              totalizadas.
            </>,
            <>
              <strong>Ordem de chegada</strong>: estados e cidades totalizam em ritmos diferentes. Por isso quem está à frente pode mudar ao longo
              da noite. O gráfico da apuração mostra essa evolução.
            </>,
          ]}
        />
        <p>
          Quando o TSE ainda não totalizou nenhuma seção de um lugar, ele aparece como <strong>aguardando</strong>, em cinza, nos mapas e tabelas.
        </p>
      </Secao>

      <Secao id="eleito" titulo="“Matematicamente eleito”">
        <p>
          Antes do fim da contagem, mostramos <strong>matematicamente eleito</strong> quando a diferença entre o primeiro e o segundo colocados já é
          maior que todo o eleitorado das seções que faltam totalizar. Ou seja: mesmo que todos os eleitores restantes comparecessem e votassem em
          quem está atrás, não daria para virar.
        </p>
        <ExemploEleito />
        <p>
          É uma regra conservadora: considera que todos os eleitores das seções que faltam votariam, o que nunca acontece. Também mostramos{' '}
          <strong>quanto falta para virar</strong>: o percentual dos votos válidos que ainda devem chegar de que quem está atrás precisaria. Ao
          fim da totalização, o selo vira simplesmente <strong>eleito</strong>. A proclamação oficial é sempre da Justiça Eleitoral.
        </p>
      </Secao>

      <Secao id="simulacao" titulo="A simulação">
        <p>
          Para testar o produto e mostrar como a noite da apuração vai funcionar, o Sintonia tem um <strong>modo de simulação</strong>. Um motor
          gera uma apuração fictícia com a estrutura real do país (seções, eleitorado, ritmo de chegada por região e o desenho do 1º turno). Os
          números não são previsão nem pesquisa: são fictícios.
        </p>
        <Destaque icone="alerta" tom="marca" titulo="Como a simulação é sinalizada">
          <Lista
            itens={[
              <>
                Uma faixa <strong>“SIMULAÇÃO · dados fictícios”</strong> fica visível em todas as páginas.
              </>,
              <>Os placares levam o selo SIMULAÇÃO e as imagens de compartilhamento saem com a marca SIMULAÇÃO.</>,
              <>
                Os candidatos aparecem como <strong>“Candidato A”</strong> e <strong>“Candidato B”</strong>, na ordem do número na urna, para que
                prints de números fictícios nunca circulem associados a pessoas reais.
              </>,
              <>O 1º turno exibido é sempre o resultado oficial: simulação e dados reais nunca se misturam.</>,
            ]}
          />
        </Destaque>
      </Secao>

      <Secao id="neutralidade" titulo="Cores e neutralidade">
        <p>
          As cores dos candidatos seguem só a <strong>ordem do número na urna</strong>: o menor número fica com o turquesa e o maior, com o âmbar.
          Nunca usamos as cores dos partidos (vermelho, azul, verde e amarelo). O par turquesa × âmbar também funciona para quem tem daltonismo.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Amostra cor="a" titulo="Menor número na urna" texto="Turquesa · sempre à esquerda ou em cima" />
          <Amostra cor="b" titulo="Maior número na urna" texto="Âmbar · sempre à direita ou embaixo" />
        </div>
        <Lista
          itens={[
            <>Os dois candidatos aparecem sempre na ordem da urna, com a mesma tipografia e o mesmo tamanho. Nunca reordenamos por quem lidera.</>,
            <>Usamos monogramas (iniciais) em vez de fotos. Não usamos imagens geradas de candidatos.</>,
            <>Os textos são descritivos (“passa à frente”, “matematicamente eleito”), sem adjetivos nem torcida.</>,
            <>
              <strong>Não fazemos enquetes</strong> e nunca mostramos números somados de preferência de usuários (Lei 9.504/97, art. 33, §5º).
            </>,
          ]}
        />
      </Secao>

      <Secao id="teste-cego" titulo="Teste Cego">
        <p>
          O Teste Cego apresenta <strong>{fmtInt(PROPOSTAS.length)} propostas reais</strong>, uma de cada candidato à Presidência em cada um de{' '}
          <strong>{fmtInt(TEMAS.length)} temas</strong>, sem nome, partido, número ou slogan. A pessoa escolhe a que prefere (ou “nenhuma das
          duas”, ou “tanto faz”) e, no fim, vê de quem era cada uma.
        </p>
        <Subtitulo>Como as propostas foram escolhidas e escritas</Subtitulo>
        <Lista
          itens={[
            <>Todas saem dos programas de governo registrados no TSE, lidos na íntegra. Nenhuma foi tirada de reportagem, discurso ou rede social.</>,
            <>
              Cada uma foi reescrita numa frase curta e concreta (até 140 caracteres, começando por um verbo), sem marcas de programas, nomes
              próprios ou termos que denunciem o autor. Uma verificação automática barra pistas de autoria.
            </>,
            <>Escolhemos pontos centrais e comparáveis em cada tema, um de cada candidato, para que a escolha seja entre ideias.</>,
            <>Depois da escolha, mostramos o trecho original entre aspas e o link para a página exata do documento.</>,
          ]}
        />
        <Subtitulo>Como calculamos a sintonia</Subtitulo>
        <Lista
          itens={[
            <>Cada tema vale 1 ponto.</>,
            <>Escolher uma proposta dá o ponto inteiro ao autor dela; “tanto faz” divide meio a meio; “nenhuma das duas” não pontua ninguém.</>,
            <>Sintonia = pontos ÷ {fmtInt(TEMAS.length)}. Os dois números são independentes e não precisam somar 100%.</>,
            <>A ordem dos temas e o lado de cada proposta são sorteados por uma semente aleatória, para que a posição não influencie.</>,
          ]}
        />
        <Destaque icone="olho-fechado" titulo="Suas respostas não saem do seu aparelho">
          O cálculo é feito no seu navegador. Não há envio, registro nem analytics das escolhas. O resultado e o Duelo carregam as respostas
          codificadas no próprio link, depois do “#”, parte que o navegador não envia a servidor. <LinkInterno to="/privacidade">Privacidade</LinkInterno>
        </Destaque>
        <Destaque icone="info" titulo="Não é pesquisa nem recomendação de voto">
          O teste compara {fmtInt(PROPOSTAS.length)} propostas escritas, não pessoas, trajetórias ou partidos. Programas de governo têm centenas
          de pontos: leia os documentos completos.
        </Destaque>

        <Subtitulo>Documentos-fonte</Subtitulo>
        <ul className="grid grid-cols-1 gap-3">
          {([13, 22] as const).map((n) => {
            const d = DOCUMENTOS[n];
            return (
              <li key={n} className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
                <div className="flex items-start gap-3.5">
                  <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-fg-muted">
                    <Icon name="lista" size={19} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold leading-snug text-fg">
                      <span className="num">Nº {n}</span> · {d.titulo}
                    </p>
                    <p className="num mt-1 text-[13px] text-fg-muted">
                      PDF · {fmtInt(d.paginas)} páginas · cópia integral publicada por {d.publicadoPor}
                    </p>
                    <p className="mt-2 text-[12px] text-fg-subtle">
                      SHA-256 do arquivo lido: <span className="break-all font-mono text-[11.5px] text-fg-muted">{d.sha256}</span>
                    </p>
                    <div className="mt-3">
                      <LinkExterno href={d.pdf} className="text-[14px]">
                        Abrir o PDF
                      </LinkExterno>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="text-[14.5px]">
          Os planos também estão reunidos na{' '}
          <LinkExterno href={DOCUMENTOS.paginaOficialTse}>página oficial do TSE com as propostas de governo</LinkExterno>. Lemos as cópias integrais
          publicadas pela imprensa porque o servidor do TSE estava inacessível no momento da pesquisa; o número de páginas confere com o registrado.
        </p>

        <ListaPropostas />

        {EM_REVISAO ? (
          <Destaque icone="alerta" tom="alerta" titulo="Revisão editorial">
            As propostas foram extraídas e reescritas a partir dos documentos oficiais e estão em revisão humana editorial e jurídica final. Cada
            frase será conferida contra o documento registrado no TSE antes da publicação definitiva. Viu algum problema? Escreva para{' '}
            <Email endereco={CONTATO.correcoes} />.
          </Destaque>
        ) : null}
      </Secao>

      <Secao id="correcoes" titulo="Correções">
        <p>
          Erramos? Queremos saber. Correções de dados, de texto ou de fonte podem ser enviadas para <Email endereco={CONTATO.correcoes} />.
          Correções relevantes são registradas nesta página, com data.
        </p>
      </Secao>
    </PaginaInstitucional>
  );
}

/** Exemplo numérico (fictício) do "matematicamente eleito". */
function ExemploEleito() {
  const lider = 61_200_000;
  const segundo = 54_900_000;
  const dif = lider - segundo;
  const casos = [
    { pct: 92.4, restante: 9_800_000 },
    { pct: 96.1, restante: 5_100_000 },
  ];
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <div className="border-b border-line bg-surface-2/60 px-4 py-3 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-fg-muted">
        Exemplo com números fictícios
      </div>
      <div className="grid grid-cols-1 divide-y divide-line sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        {casos.map((c) => {
          const eleito = dif > c.restante;
          return (
            <div key={c.pct} className="p-4 text-[14px] leading-relaxed sm:p-5">
              <p className="num text-[12.5px] font-semibold text-fg-muted">Com {fmtPct(c.pct)} das seções</p>
              <dl className="num mt-2 space-y-1">
                <div className="flex justify-between gap-3">
                  <dt>Diferença entre os dois</dt>
                  <dd className="font-semibold text-fg">{fmtInt(dif)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Eleitorado que falta</dt>
                  <dd className="font-semibold text-fg">{fmtInt(c.restante)}</dd>
                </div>
              </dl>
              <p className={cn('mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold', eleito ? 'bg-brand/15 text-brand-fg' : 'bg-surface-3 text-fg-muted')}>
                <Icon name={eleito ? 'check' : 'relogio'} size={14} />
                {eleito ? 'Matematicamente eleito' : 'Ainda pode virar'}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Amostra({ cor, titulo, texto }: { cor: 'a' | 'b'; titulo: string; texto: string }) {
  return (
    <div className="flex items-center gap-3.5 rounded-2xl border border-line bg-surface p-4">
      <span aria-hidden className={cn('h-11 w-11 shrink-0 rounded-xl', cor === 'a' ? 'bg-cand-a' : 'bg-cand-b')} />
      <div className="min-w-0">
        <p className="text-[15px] font-semibold text-fg">{titulo}</p>
        <p className="text-[13.5px] text-fg-muted">{texto}</p>
      </div>
    </div>
  );
}

/** As 24 propostas com a fonte — fechadas por padrão, porque revelam a autoria (spoiler do teste). */
function ListaPropostas() {
  const [aberto, setAberto] = useState(false);
  const porTema = useMemo(
    () => TEMAS.map((t) => ({ tema: t, itens: PROPOSTAS.filter((p) => p.tema === t.id).sort((a, b) => a.autor - b.autor) })),
    [],
  );
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls="lista-propostas"
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-surface-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand sm:p-5"
      >
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand-fg">
          <Icon name="olho-fechado" size={19} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-fg">
            As <span className="num">{fmtInt(PROPOSTAS.length)}</span> propostas e suas fontes
          </span>
          <span className="block text-[13px] text-fg-muted">Revela de quem é cada proposta. Se ainda vai fazer o teste, deixe para depois.</span>
        </span>
        <Icon name="chevron" size={18} className={cn('shrink-0 text-fg-subtle transition-transform', aberto && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {aberto ? (
          <motion.div
            id="lista-propostas"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 0.9, 0.24, 1] }}
            className="overflow-hidden"
          >
            <ol className="divide-y divide-line border-t border-line">
              {porTema.map(({ tema, itens }) => (
                <li key={tema.id} className="p-4 sm:p-5">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-fg-muted">
                    <span aria-hidden className="mr-1.5">
                      {tema.emoji}
                    </span>
                    {tema.rotulo}
                  </p>
                  <ul className="mt-2.5 space-y-3">
                    {itens.map((p) => (
                      <ItemProposta key={p.id} p={p} />
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function ItemProposta({ p }: { p: Proposta }) {
  return (
    <li className="flex gap-3">
      <span
        className={cn(
          'num mt-0.5 inline-flex h-6 min-w-[2rem] shrink-0 items-center justify-center rounded-md px-1.5 text-[12px] font-bold',
          p.autor === 13 ? 'bg-cand-a/15 text-cand-a-fg' : 'bg-cand-b/15 text-cand-b-fg',
        )}
      >
        {p.autor}
      </span>
      <div className="min-w-0 text-[14px] leading-snug">
        <p className="text-fg">{p.texto}</p>
        <p className="mt-1 text-[12.5px] text-fg-muted">
          <a href={p.fonte.url} target="_blank" rel="noopener noreferrer" className="underline decoration-line/[3] underline-offset-2 hover:text-fg">
            {p.fonte.pagina}
          </a>
        </p>
      </div>
    </li>
  );
}
