/**
 * /metodologia — de onde vêm os dados (TSE, IBGE), como funciona a apuração e o "matematicamente eleito",
 * a simulação e como ela é sinalizada, a regra de cores (identificação para Presidente, neutras no resto) e a metodologia do Teste Cego
 * (afirmações únicas com escala de concordância: redação, posições documentadas, fórmula, documentos-fonte e
 * aviso de revisão editorial).
 */
import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ACESSO,
  afinidadeItem,
  AFIRMACOES,
  CANDIDATOS,
  DOCUMENTOS,
  TEMA_POR_ID,
  TEMAS,
  type Candidato,
  type Posicao,
  type ValorLikert,
} from '@/app/content/afirmacoes';
import { fmtInt, fmtPct } from '@/shared/format';
import { REGRA_CORES, coresPresidente } from '@/shared/cores';
import type { CorCandidato } from '@/shared/types';
import { useMeta } from '@/app/data/hooks';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
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
import { OPCOES_ESCALA } from '@/app/components/pages/teste/sintonia';

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
      atualizado="10 de outubro de 2026"
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
        <p>{REGRA_CORES}</p>
        <p>
          Com os nomes ocultos, a simulação não usa vermelho nem azul: a cor diria quem é quem. Os pares vermelho × azul e turquesa × âmbar
          também se distinguem para quem tem daltonismo, e a identidade nunca depende só da cor (sempre há nome ao lado).
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Amostra cor="vermelho" titulo="Lula · Presidente" texto="Vermelho · cor de identificação" />
          <Amostra cor="azul" titulo="Flávio Bolsonaro · Presidente" texto="Azul · cor de identificação" />
          <Amostra cor="a" titulo="Menor número na urna" texto="Turquesa · governadores e simulação com nomes ocultos" />
          <Amostra cor="b" titulo="Maior número na urna" texto="Âmbar · governadores e simulação com nomes ocultos" />
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
          O Teste Cego apresenta <strong>{fmtInt(AFIRMACOES.length)} afirmações sobre políticas públicas</strong>, duas em cada um de{' '}
          <strong>{fmtInt(TEMAS.length)} temas</strong>, uma por vez e em ordem sorteada. Para cada uma, a pessoa diz o quanto concorda, numa
          escala que vai da esquerda para a direita —{' '}
          <em>discordo totalmente, discordo, neutro, concordo ou concordo totalmente</em> — ou pula. No fim, comparamos as respostas com a{' '}
          <strong>posição documentada</strong> de cada candidato à Presidência no programa de governo registrado no TSE.
        </p>
        <p>
          Há também um <strong>modo rápido</strong>, com {fmtInt(TEMAS.length)} afirmações (uma por tema). Elas são sorteadas só entre as
          combinações equilibradas: concordar aproxima dos dois candidatos na mesma medida e os dois percentuais têm a mesma base de cálculo.
          A conta é a mesma do teste completo, com menos itens; dá para completar as demais depois, aproveitando as respostas.
        </p>
        <p>
          Até 9 de outubro o teste mostrava pares de propostas, uma de cada candidato, lado a lado. Trocamos pelo formato de afirmações únicas
          (como o Wahl-O-Mat alemão e o Vote Compass) porque o estilo e o contraste entre as duas frases acabavam entregando a autoria.
        </p>

        <Subtitulo>Como as afirmações foram escritas</Subtitulo>
        <Lista
          itens={[
            <>
              São frases da redação, não citações: curtas (até 110 caracteres), afirmativas, concretas e em linguagem simples. Não trazem nome,
              partido, número, marca de programa, slogan nem palavras de enquadramento de campanha. Uma verificação automática barra essas pistas.
            </>,
            <>Cada uma precisa permitir que alguém de qualquer campo concorde ou discorde com dignidade; quando a resposta parecia óbvia, a frase passou a dizer o custo da escolha.</>,
            <>Nenhuma usa “não deve”, para que “discordo” nunca vire uma negação dupla.</>,
            <>
              A direção é equilibrada: em metade das afirmações com posição, concordar aproxima de um candidato; na outra metade, do outro. Duas
              são de controle (os dois planos concordam). Assim, responder sempre a mesma coisa não favorece ninguém.
            </>,
            <>Algumas trazem uma linha de contexto factual (por exemplo, a regra em vigor hoje), que pode ser lida antes de responder.</>,
          ]}
        />

        <Subtitulo>Como identificamos a posição de cada candidato</Subtitulo>
        <Lista
          itens={[
            <>Só pelo texto do programa de governo, lido na íntegra. Nada de entrevista, debate, histórico ou declaração de aliados.</>,
            <>
              <strong>Concorda</strong> ou <strong>discorda</strong> só quando o plano é explícito; <strong>posição intermediária</strong> quando o
              plano assume um meio-termo; <strong>sem posição</strong> quando o plano não trata do assunto — e aí o item não conta para aquele
              candidato.
            </>,
            <>Toda posição traz o trecho literal entre aspas, a página e o link direto para ela no PDF. Quando a leitura exigiu contexto, a nota explica por quê.</>,
          ]}
        />

        <Subtitulo>Como calculamos a sintonia</Subtitulo>
        <Formula />
        <Lista
          itens={[
            <>
              Em cada afirmação, a resposta (de +2 a −2) é comparada com a posição do candidato (+2 concorda, 0 intermediária, −2 discorda):
              igual vale 100% e cada passo de distância na escala tira 25%.
            </>,
            <>
              “Neutro” é uma resposta: fica no meio da escala e entra na conta. Para “não sei” ou “prefiro não opinar”, use “Pular”, que deixa
              a afirmação de fora.
            </>,
            <>As afirmações marcadas como “isso pesa mais para mim” contam em dobro.</>,
            <>
              Ficam fora da conta de um candidato as afirmações puladas e aquelas que o plano dele não trata. Por isso o resultado diz “com base
              em N afirmações” para cada um, e os dois números são independentes: <strong>não somam 100%</strong>. Eles aparecem
              arredondados para inteiro, e nenhum é apresentado como “vencedor”.
            </>,
            <>A quebra por tema usa a mesma conta, restrita às duas afirmações de cada tema.</>,
            <>
              No <strong>Duelo</strong>, a afinidade entre duas pessoas usa a mesma régua entre as respostas delas. “Concordaram” significa ficar
              do mesmo lado da escala (as duas concordam, as duas discordam ou as duas neutras).
            </>,
            <>A ordem das afirmações é sorteada por uma semente aleatória (que vai no link e não é dado pessoal) e nunca põe duas do mesmo tema seguidas.</>,
          ]}
        />
        <Destaque icone="olho-fechado" titulo="Suas respostas não saem do seu aparelho">
          O cálculo é feito no seu navegador. Não há envio, registro nem analytics das respostas. O resultado e o Duelo carregam as respostas
          codificadas no próprio link, depois do “#”, parte que o navegador não envia a servidor. <LinkInterno to="/privacidade">Privacidade</LinkInterno>
        </Destaque>
        <Destaque icone="info" titulo="Não é pesquisa nem recomendação de voto">
          O teste mede a distância entre as respostas da pessoa e o que está escrito nos programas — não avalia pessoas, trajetórias ou partidos.
          Programas de governo têm centenas de pontos: leia os documentos completos. Nunca somamos respostas de pessoas diferentes.
        </Destaque>

        <Subtitulo>Documentos-fonte</Subtitulo>
        <ul className="grid grid-cols-1 gap-3">
          {CANDIDATOS.map((n) => {
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
          Acesso aos documentos: <span className="num">{ACESSO.split('-').reverse().join('/')}</span>.
        </p>

        <ListaAfirmacoesFontes />

        {EM_REVISAO ? (
          <Destaque icone="alerta" tom="alerta" titulo="Revisão editorial">
            As afirmações e as posições foram preparadas a partir dos documentos oficiais e estão em revisão humana editorial e jurídica final.
            Cada posição será conferida contra o documento registrado no TSE antes da publicação definitiva. Viu algum problema? Escreva para{' '}
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

function Amostra({ cor, titulo, texto }: { cor: CorCandidato; titulo: string; texto: string }) {
  return (
    <div className="flex items-center gap-3.5 rounded-2xl border border-line bg-surface p-4">
      <span aria-hidden className={cn('h-11 w-11 shrink-0 rounded-xl', corSlot(cor).bg)} />
      <div className="min-w-0">
        <p className="text-[15px] font-semibold text-fg">{titulo}</p>
        <p className="text-[13.5px] text-fg-muted">{texto}</p>
      </div>
    </div>
  );
}


/** Fórmula da sintonia e a tabela de afinidade por afirmação (resposta × posição documentada). */
function Formula() {
  const posicoes: { rotulo: string; c: ValorLikert }[] = [
    { rotulo: 'Concorda', c: 2 },
    { rotulo: 'Intermediária', c: 0 },
    { rotulo: 'Discorda', c: -2 },
  ];
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border border-line bg-surface-2/60 p-4 sm:p-5">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-fg-muted">Fórmula</p>
        <div className="mt-3 space-y-2 font-mono text-[12.5px] leading-relaxed text-fg sm:text-[14px]">
          <p>
            <span className="whitespace-nowrap">afinidade = 1 − |resposta − posição|</span> <span className="whitespace-nowrap">÷ 4</span>
          </p>
          <p>
            <span className="whitespace-nowrap">sintonia = 100 × Σ (peso × afinidade)</span> <span className="whitespace-nowrap">÷ Σ peso</span>
          </p>
        </div>
        <p className="mt-3 text-[13px] leading-snug text-fg-muted">
          Resposta: −2 discordo totalmente · −1 discordo · 0 neutro · +1 concordo · +2 concordo totalmente. Posição: −2 discorda · 0
          intermediária · +2 concorda. Peso: 2 nas afirmações que pesam mais para a pessoa, 1 nas demais.
        </p>
      </div>
      <figure className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        <figcaption className="border-b border-line bg-surface-2/60 px-4 py-3 text-[12.5px] leading-snug text-fg-muted">
          Afinidade em uma afirmação, conforme a sua resposta e a posição documentada no plano
        </figcaption>
        <table className="w-full table-fixed text-[13px] sm:text-[14px]">
          <thead>
            <tr className="text-[10.5px] uppercase tracking-[0.04em] text-fg-muted sm:text-[11.5px] sm:tracking-[0.08em]">
              <th scope="col" className="w-[36%] px-4 py-2.5 text-left font-semibold">
                Resposta
              </th>
              {posicoes.map((p) => (
                <th key={p.c} scope="col" className="px-1 py-2.5 text-right font-semibold last:pr-4 sm:px-3">
                  <span className="sm:hidden">{p.rotulo === 'Intermediária' ? 'Interm.' : p.rotulo}</span>
                  <span className="hidden sm:inline">Plano {p.rotulo.toLowerCase()}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line border-t border-line">
            {OPCOES_ESCALA.map((o) => (
              <tr key={o.valor}>
                <th scope="row" className="px-4 py-2.5 text-left font-medium text-fg">
                  {o.rotulo}
                </th>
                {posicoes.map((p) => (
                  <td key={p.c} className="num px-1 py-2.5 text-right font-semibold text-fg last:pr-4 sm:px-3">
                    {fmtPct(afinidadeItem(o.valor, p.c) * 100, 0)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </figure>
    </div>
  );
}

const ROTULO_CURTO: Record<Posicao['valor'], string> = {
  concorda: 'Concorda',
  discorda: 'Discorda',
  neutro: 'Intermediária',
  'sem-posicao': 'Sem posição no plano',
};

/** As 24 afirmações com as posições e fontes — fechadas por padrão, porque revelam as posições (spoiler). */
function ListaAfirmacoesFontes() {
  const [aberto, setAberto] = useState(false);
  const porTema = useMemo(() => TEMAS.map((t) => ({ tema: t, itens: AFIRMACOES.filter((a) => a.tema === t.id) })), []);
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls="lista-afirmacoes"
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-surface-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand sm:p-5"
      >
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand-fg">
          <Icon name="olho-fechado" size={19} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-fg">
            As <span className="num">{fmtInt(AFIRMACOES.length)}</span> afirmações, as posições e as fontes
          </span>
          <span className="block text-[13px] text-fg-muted">Revela a posição de cada candidato. Se ainda vai fazer o teste, deixe para depois.</span>
        </span>
        <Icon name="chevron" size={18} className={cn('shrink-0 text-fg-subtle transition-transform', aberto && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {aberto ? (
          <motion.div
            id="lista-afirmacoes"
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
                      {TEMA_POR_ID[tema.id].emoji}
                    </span>
                    {tema.rotulo}
                  </p>
                  <ul className="mt-2.5 space-y-4">
                    {itens.map((a) => (
                      <li key={a.id} className="text-[14px] leading-snug">
                        <p className="text-fg">{a.texto}</p>
                        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
                          {CANDIDATOS.map((n) => (
                            <PosicaoCurta key={n} n={n} p={a.posicoes[n]} />
                          ))}
                        </ul>
                      </li>
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

/** Cor de identificação do candidato (CORES_IDENTIDADE), pela ordem da urna entre os dois. */
const corDoAutor = (n: Candidato): CorCandidato => {
  const [x, y] = [...CANDIDATOS].sort((p, q) => p - q) as [Candidato, Candidato];
  return coresPresidente([x, y])[n === x ? 0 : 1];
};

function PosicaoCurta({ n, p }: { n: Candidato; p: Posicao }) {
  return (
    <li className="inline-flex items-center gap-2 text-[12.5px] text-fg-muted">
      <span
        className={cn(
          'num inline-flex h-6 min-w-[2rem] shrink-0 items-center justify-center rounded-md px-1.5 text-[12px] font-bold',
          corSlot(corDoAutor(n)).bgSoft,
          corSlot(corDoAutor(n)).text,
        )}
      >
        {n}
      </span>
      <span className={p.valor === 'sem-posicao' ? 'text-fg-subtle' : 'text-fg'}>{ROTULO_CURTO[p.valor]}</span>
      {p.fonte ? (
        <a href={p.fonte.url} target="_blank" rel="noopener noreferrer" className="num underline decoration-line/[3] underline-offset-2 hover:text-fg">
          p. {p.fonte.pagina}
        </a>
      ) : null}
    </li>
  );
}
