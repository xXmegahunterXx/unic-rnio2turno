/**
 * /teste/resultado#<código> — resultado do Teste Cego. O estado vem SÓ do hash da URL (nunca enviado a
 * servidor, nunca analytics). Revelação animada da sintonia com cada candidato (ordem da urna, cores por
 * slot), fita das escolhas, revelação tema a tema com trecho e fonte, compartilhar e desafiar.
 */
import { useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { DOCUMENTOS } from '@/app/content/propostas';
import { fmtInt } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import { Container } from '@/app/components/layout/Container';
import { EmptyState } from '@/app/components/apuracao/States';
import { useTitulo } from '@/app/components/pages/home/useTitulo';
import { useCandidatosTeste } from '@/app/components/pages/teste/candidatos';
import { caminhoTeste, decodificar, novaSemente } from '@/app/components/pages/teste/codigo';
import { CompartilharCartao, DesafiarAmigo } from '@/app/components/pages/teste/Compartilhar';
import { Fita, LegendaFita } from '@/app/components/pages/teste/Fita';
import { Aviso, EM_REVISAO } from '@/app/components/pages/teste/IntroTeste';
import { MedidorSintonia, resumoEscolhas, useRevelado } from '@/app/components/pages/teste/Revelacao';
import { apagarProgresso } from '@/app/components/pages/teste/sessao';
import { calcularSintonia, type Autor } from '@/app/components/pages/teste/sintonia';
import { TemaATema } from '@/app/components/pages/teste/TemaATema';
import { Badge, Button, ButtonLink, Icon } from '@/app/ui';

export default function ResultadoPage() {
  const { hash } = useLocation();
  const dados = useMemo(() => decodificar(hash), [hash]);
  useTitulo('Seu resultado · Teste Cego');
  if (!dados) return <SemResultado />;
  return <Resultado key={hash} seed={dados.seed} respostas={dados.respostas} />;
}

function SemResultado() {
  return (
    <Container className="py-10 sm:py-16">
      <div className="mx-auto max-w-lg rounded-3xl border border-line bg-surface shadow-card">
        <EmptyState
          icon="olho-fechado"
          title="Nenhum resultado neste link"
          description="O resultado do Teste Cego fica só no próprio link. Este parece incompleto — faça o teste em 2 minutos."
          action={
            <ButtonLink to="/teste" variant="primary" iconRight="seta">
              Fazer o Teste Cego
            </ButtonLink>
          }
        />
      </div>
    </Container>
  );
}

export function useRefazer() {
  const navigate = useNavigate();
  return () => {
    apagarProgresso();
    navigate(caminhoTeste(novaSemente()));
  };
}

function Resultado({ seed, respostas }: { seed: number; respostas: import('@/app/components/pages/teste/codigo').Escolha[] }) {
  const { lista, porNumero } = useCandidatosTeste();
  const s = useMemo(() => calcularSintonia(seed, respostas), [seed, respostas]);
  const revelado = useRevelado();
  const refazer = useRefazer();
  const reduzir = useReducedMotion();
  const [a, b] = lista;

  return (
    <Container className="pb-4 pt-4 sm:pt-8">
      <section aria-labelledby="titulo-resultado" className="relative overflow-hidden rounded-[28px] border border-line bg-surface px-4 pb-6 pt-6 shadow-card sm:px-10 sm:pb-10 sm:pt-10">
        {/* brilhos simétricos nos dois slots (ninguém em destaque) */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <motion.div
            className={cn('absolute -left-32 -top-32 h-80 w-80 rounded-full blur-3xl', a ? corSlot(a.cor).bgSoft : '')}
            initial={{ opacity: 0 }}
            animate={{ opacity: revelado ? 0.9 : 0 }}
            transition={{ duration: 1.2 }}
          />
          <motion.div
            className={cn('absolute -right-32 -top-32 h-80 w-80 rounded-full blur-3xl', b ? corSlot(b.cor).bgSoft : '')}
            initial={{ opacity: 0 }}
            animate={{ opacity: revelado ? 0.9 : 0 }}
            transition={{ duration: 1.2 }}
          />
          <div className="absolute inset-0 bg-noise opacity-60" />
        </div>

        <div className="relative">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Badge tone="brand" size="sm" icon="olho-fechado" caps>
              Teste Cego · resultado
            </Badge>
          </div>
          <h1 id="titulo-resultado" className="mx-auto mt-4 max-w-[22ch] text-balance text-center font-display text-[28px] font-semibold leading-[1.05] tracking-[-0.035em] text-fg sm:text-[44px]">
            {revelado ? 'Com quem suas escolhas estão em sintonia' : 'Revelando de quem eram as propostas…'}
          </h1>

          <div className="mx-auto mt-7 grid max-w-[720px] grid-cols-2 gap-3 sm:mt-10 sm:gap-10">
            {lista.map((c, i) => (
              <MedidorSintonia key={c.numero} candidato={c} pct={s.pct[c.numero as Autor] ?? 0} revelado={revelado} ordem={i} />
            ))}
          </div>

          <motion.p
            initial={reduzir ? false : { opacity: 0, y: 8 }}
            animate={revelado ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
            transition={{ duration: 0.4, delay: reduzir ? 0 : 0.9 }}
            className="mx-auto mt-6 max-w-[40rem] text-balance text-center text-[14.5px] leading-relaxed text-fg-muted sm:mt-8 sm:text-[16px]"
          >
            {resumoEscolhas(s, lista)}
          </motion.p>

          <div className="mx-auto mt-6 max-w-[720px] sm:mt-8">
            <Fita sintonia={s} porNumero={porNumero} revelado={revelado} />
            <LegendaFita sintonia={s} candidatos={lista} porNumero={porNumero} className="mt-3 justify-center" />
          </div>

          <div className="mx-auto mt-7 flex max-w-[720px] flex-col gap-2.5 sm:mt-9 sm:flex-row sm:justify-center">
            <CompartilharCartao sintonia={s} candidatos={lista} porNumero={porNumero} className="w-full sm:w-auto" />
            <DesafiarAmigo seed={seed} respostas={respostas} className="w-full sm:w-auto" />
            <Button variant="ghost" size="lg" icon="reset" onClick={refazer} className="w-full sm:w-auto">
              Refazer
            </Button>
          </div>
        </div>
      </section>

      <div className="mt-4 grid grid-cols-1 gap-3 md:mt-6 md:grid-cols-2 md:gap-4">
        <Aviso icone="info" titulo="Não é recomendação de voto">
          O teste mede sintonia com {fmtInt(s.temas.length * 2)} propostas escritas — não com pessoas, partidos ou trajetórias. Programas de
          governo têm centenas de pontos: leia os documentos completos antes de decidir.
        </Aviso>
        <Aviso icone="grafico" titulo="Como calculamos">
          Cada tema vale 1 ponto. A proposta escolhida dá o ponto ao autor; “tanto faz” divide meio a meio; “nenhuma das duas” não
          pontua. Por isso os dois números não precisam somar 100%.
        </Aviso>
      </div>

      <section aria-labelledby="tema-a-tema" className="mt-10 sm:mt-14">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="tema-a-tema" className="font-display text-[22px] font-semibold tracking-[-0.02em] text-fg sm:text-[26px]">
              Tema a tema
            </h2>
            <p className="mt-1 text-[14px] text-fg-muted">De quem era cada proposta, com o trecho original e a página do documento.</p>
          </div>
        </div>
        <div className="mt-2">
          <TemaATema temas={s.temas} porNumero={porNumero} abertosInicial={[0]} />
        </div>
      </section>

      <section aria-labelledby="documentos" className="mt-10 sm:mt-14">
        <h2 id="documentos" className="font-display text-[22px] font-semibold tracking-[-0.02em] text-fg sm:text-[26px]">
          Leia os programas completos
        </h2>
        <ul className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
          {lista.map((c) => {
            const d = DOCUMENTOS[c.numero as Autor];
            const sl = corSlot(c.cor);
            return (
              <li key={c.numero}>
                <a
                  href={d.pdf}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex h-full items-start gap-4 rounded-2xl border border-line bg-surface p-4 shadow-card transition-[border-color,transform] duration-200 hover:-translate-y-px hover:border-line/[2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand sm:p-5"
                >
                  <span className={cn('mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', sl.bgSoft, sl.text)}>
                    <Icon name="lista" size={20} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold leading-snug text-fg">{c.nomeUrna}</span>
                    <span className="mt-1 block text-pretty text-[13px] leading-snug text-fg-muted">{d.titulo}</span>
                    <span className="num mt-2 block text-[12px] text-fg-subtle">
                      PDF · {fmtInt(d.paginas)} páginas · cópia publicada por {d.publicadoPor}
                    </span>
                  </span>
                  <Icon name="externo" size={18} className="mt-1 shrink-0 text-fg-subtle transition-colors group-hover:text-fg" />
                </a>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-[12.5px] leading-snug text-fg-subtle">
          Documentos registrados no TSE.{' '}
          <Link to="/metodologia#teste-cego" className="underline decoration-line underline-offset-2 hover:text-fg">
            Como escolhemos e reescrevemos as propostas
          </Link>
          {EM_REVISAO ? ' · textos em revisão editorial final.' : '.'}
        </p>
      </section>

      <section className="mt-10 overflow-hidden rounded-3xl border border-line bg-surface p-5 shadow-card sm:mt-14 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-[22px] font-semibold tracking-[-0.02em] text-fg sm:text-[26px]">E no dia 25?</h2>
            <p className="mt-1 max-w-xl text-[14.5px] leading-relaxed text-fg-muted">
              A partir das 17h, acompanhe a apuração ao vivo — do Brasil inteiro até a urna da sua seção.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <ButtonLink to="/apuracao" variant="secondary" size="lg" icon="ao-vivo">
              Apuração
            </ButtonLink>
            <ButtonLink to="/apuracao/consulta" variant="ghost" size="lg" icon="busca">
              Consulte sua seção
            </ButtonLink>
          </div>
        </div>
      </section>
    </Container>
  );
}
