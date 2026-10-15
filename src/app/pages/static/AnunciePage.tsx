/**
 * /anuncie — "Anuncie no Sintonia" (media kit): por que anunciar, os formatos desenhados com os componentes REAIS do
 * site (com um anúncio de exemplo), cotas, regras, o que enviar e o contato comercial (`LiveStatus.anuncie`, definido
 * no admin: WhatsApp e/ou e-mail com mensagem pronta).
 *
 * Sem números de audiência: nada de alcance inventado. Só o que o produto entrega de fato (formatos, rótulos, relatório
 * de impressões visíveis, cliques e taxa de cliques). Neutralidade: nenhum candidato, foto ou cor de candidato aqui.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ANUNCIO_LIMITES, FORMATOS_ANUNCIO, ROTULO_FORMATO, type AnuncioPublico, type FormatoAnuncio } from '@/shared/anuncios';
import { fmtInt } from '@/shared/format';
import { useStatus } from '@/app/data/hooks';
import { cn } from '@/app/lib/cn';
import { Icon, type IconName } from '@/app/ui/Icon';
import { ButtonLink, buttonClasses } from '@/app/ui/Button';
import { Container } from '@/app/components/layout/Container';
import { IconeQualquer } from '@/app/components/layout/IconesExtras';
import { FundoHero } from '@/app/components/pages/home/FundoHero';
import { useTitulo } from '@/app/components/pages/home/useTitulo';
import { useRolarParaHash } from '@/app/components/pages/home/Institucional';
import { AnuncioNativoPeca, OferecimentoTestePeca, VitrineFormato, fmtWhatsApp, linkEmail, linkWhatsApp } from '@/app/components/anuncios';

/** Anúncio de exemplo da vitrine (nenhuma empresa real). */
const EXEMPLO: AnuncioPublico = {
  id: 'exemplo',
  marca: 'Sua marca aqui',
  titulo: 'Sua chamada em destaque, com até 60 caracteres',
  texto: 'Um texto curto de apoio explica a oferta. O botão leva direto ao seu site, em nova aba.',
  cta: 'Saiba mais',
  href: '',
  destino: 'suamarca.com.br',
  formatos: [...FORMATOS_ANUNCIO],
  peso: 5,
  cota: 'master',
};

export default function AnunciePage() {
  useTitulo('Anuncie no Sintonia');
  useRolarParaHash();
  const contato = useStatus().data?.anuncie ?? null;
  const zap = linkWhatsApp(contato?.whatsapp);
  const email = linkEmail(contato?.email);

  return (
    <>
      <Hero chamada={contato?.chamada} zap={zap} email={email} />
      <Container wide className="pb-6">
        <PorQue />
        <Formatos />
        <Cotas />
        <Regras />
        <Envio />
        <Contato zap={zap} email={email} whatsapp={contato?.whatsapp} enderecoEmail={contato?.email} />
      </Container>
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Hero

function Hero({ chamada, zap, email }: { chamada?: string; zap: string | null; email: string | null }) {
  return (
    <section aria-labelledby="anuncie-titulo" className="relative isolate overflow-hidden">
      <FundoHero />
      <Container wide className="relative pb-10 pt-7 sm:pb-16 sm:pt-14 lg:pb-20 lg:pt-16">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14">
          <div className="min-w-0 animate-fade-up">
            <span className="inline-flex h-8 items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-fg backdrop-blur">
              <IconeQualquer name="megafone" size={15} className="text-brand-fg" />
              Anuncie no Sintonia
            </span>
            <h1
              id="anuncie-titulo"
              className="mt-4 text-balance font-display text-[40px] font-semibold leading-[0.98] tracking-[-0.045em] text-fg min-[400px]:text-[46px] sm:mt-6 sm:text-[64px] lg:text-[68px]"
            >
              Sua marca <span className="text-grad">na noite da eleição.</span>
            </h1>
            {/* a frase do painel (/admin → Anuncie) vem em destaque, numa linha própria, antes do texto padrão */}
            {chamada ? (
              <p className="mt-4 max-w-[36rem] text-pretty text-[18px] font-semibold leading-snug text-brand-fg sm:mt-5 sm:text-[21px]">
                {chamada}
              </p>
            ) : null}
            <p
              className={cn(
                'max-w-[36rem] text-pretty text-[16px] leading-relaxed text-fg-muted sm:text-[18px]',
                chamada ? 'mt-2' : 'mt-4 sm:mt-5',
              )}
            >
              A apuração do 2º turno ao vivo, do Brasil inteiro até a seção, e o Teste Cego, feito para ser compartilhado.{' '}
              <span className="text-fg">Espaços para marcas não políticas, sempre identificados como publicidade.</span>
            </p>
            <div className="mt-7 flex flex-col gap-2.5 sm:flex-row">
              {zap ? (
                <a href={zap} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: 'primary', size: 'lg' })}>
                  <Icon name="whatsapp" size={20} />
                  Falar no WhatsApp
                </a>
              ) : null}
              {email ? (
                <a href={email} className={buttonClasses({ variant: zap ? 'outline' : 'primary', size: 'lg' })}>
                  <IconeQualquer name="carta" size={20} />
                  Enviar e-mail
                </a>
              ) : null}
              {!zap && !email ? (
                <ButtonLink to={{ hash: 'contato' }} variant="primary" size="lg" icon="seta-baixo">
                  Quero anunciar
                </ButtonLink>
              ) : null}
              <ButtonLink to={{ hash: 'formatos' }} variant="outline" size="lg" icon="grade">
                Ver os formatos
              </ButtonLink>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-[12.5px] text-fg-muted sm:text-[13.5px]">
              <Selo icone="selo">Só anunciantes não políticos</Selo>
              <Selo icone="olho-fechado">Sem cookie, sem dado pessoal</Selo>
              <Selo icone="grafico">Relatório de entrega</Selo>
            </ul>
          </div>
          <Colagem />
        </div>
      </Container>
    </section>
  );
}

function Selo({ icone, children }: { icone: IconName; children: ReactNode }) {
  return (
    <li className="inline-flex items-center gap-1.5">
      <Icon name={icone} size={15} className="text-brand-fg" />
      {children}
    </li>
  );
}

/** Vitrine do hero: as peças reais (nativo + "Teste Cego oferecido por") com o anúncio de exemplo. */
function Colagem() {
  return (
    // no celular a vitrine fica só na galeria de formatos (aqui ela empurraria o resto da página)
    <div aria-label="Exemplo de anúncio no Sintonia" role="img" className="relative mx-auto hidden w-full max-w-[560px] sm:block lg:mx-0 lg:justify-self-end">
      <div aria-hidden className="pointer-events-none absolute -inset-6 -z-10 rounded-[40px] bg-brand/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none select-none">
        <AnuncioNativoPeca anuncio={EXEMPLO} previa pecaPrevia={<PecaExemplo />} variante="cartao" empilhado />
        <div className="relative -mt-6 ml-6 mr-[-0.5rem] sm:ml-16 sm:mr-[-1.5rem]">
          <OferecimentoTestePeca anuncio={EXEMPLO} previa className="shadow-[0_30px_60px_-30px_rgb(0_0_0/0.6)]" />
        </div>
      </div>
    </div>
  );
}

/** Peça de exemplo (desenhada com tokens): mostra que a imagem aparece inteira, em qualquer proporção. */
function PecaExemplo({ compacta }: { compacta?: boolean }) {
  return (
    <div className={cn('relative flex h-full w-full flex-col items-center justify-center gap-2 overflow-hidden bg-surface-3 text-center', compacta ? 'min-h-[150px] p-4' : 'min-h-[200px] p-6')}>
      <div aria-hidden className="absolute inset-0 bg-[repeating-linear-gradient(135deg,rgb(var(--line)/0.05)_0_12px,transparent_12px_24px)]" />
      <span className="relative inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-surface text-fg-muted ring-1 ring-inset ring-line">
        <Icon name="grade" size={22} />
      </span>
      <p className="relative font-display text-[19px] font-semibold tracking-[-0.02em] text-fg">Sua peça aqui</p>
      <p className="relative max-w-[16rem] text-[12.5px] leading-snug text-fg-muted">Imagem inteira, sem corte, em qualquer proporção</p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Seções

function Bloco({ id, eyebrow, titulo, descricao, children, className }: { id: string; eyebrow: string; titulo: ReactNode; descricao?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className={cn('scroll-mt-28 pt-14 sm:pt-20', className)}>
      <header className="max-w-[46rem]">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-brand-fg">{eyebrow}</p>
        <h2 id={`${id}-titulo`} className="mt-2 text-balance font-display text-[28px] font-semibold leading-[1.05] tracking-[-0.035em] text-fg sm:text-[40px]">
          {titulo}
        </h2>
        {descricao ? <p className="mt-3 text-pretty text-[15.5px] leading-relaxed text-fg-muted sm:text-[17px]">{descricao}</p> : null}
      </header>
      <div className="mt-7 sm:mt-9">{children}</div>
    </section>
  );
}

const MOTIVOS: { icone: IconName; titulo: string; texto: string }[] = [
  {
    icone: 'ao-vivo',
    titulo: '25 de outubro, ao vivo',
    texto: 'A apuração do 2º turno a partir das 17h, com placar, mapa e cada seção atualizados ao longo da noite. Sua marca junto da tela de acompanhar a eleição.',
  },
  {
    icone: 'olho-fechado',
    titulo: 'Teste Cego, feito para circular',
    texto: 'Quem faz o teste compartilha o resultado e desafia os amigos. A tela de resultado traz “Teste Cego oferecido por” a sua marca, abaixo das ações de compartilhar.',
  },
  {
    icone: 'compartilhar',
    titulo: 'Sua marca nas imagens compartilhadas',
    texto: 'Os cartões genéricos que vão para o X e o WhatsApp — Teste Cego, calculadora do 2º turno e capa das curiosidades — levam “Oferecimento: sua marca” no rodapé.',
  },
  {
    icone: 'grafico',
    titulo: 'Relatório transparente',
    texto: 'Impressões visíveis (metade do anúncio na tela por pelo menos 1 segundo), cliques e taxa de cliques, por formato e por hora.',
  },
];

function PorQue() {
  return (
    <Bloco id="por-que" eyebrow="Por que anunciar" titulo="Presença no momento em que o país acompanha o resultado">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        {MOTIVOS.map((m) => (
          <li key={m.titulo} className="relative overflow-hidden rounded-3xl border border-line bg-surface p-5 shadow-card sm:p-6">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-brand/15 text-brand-fg ring-1 ring-inset ring-brand/25">
              <Icon name={m.icone} size={21} />
            </span>
            <h3 className="mt-4 font-display text-[19px] font-semibold leading-tight tracking-[-0.02em] text-fg sm:text-[20px]">{m.titulo}</h3>
            <p className="mt-2 text-pretty text-[14.5px] leading-relaxed text-fg-muted">{m.texto}</p>
          </li>
        ))}
      </ul>
    </Bloco>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Galeria de formatos (componentes reais)

const ONDE: Record<FormatoAnuncio, string> = {
  topo: 'Logo abaixo do cabeçalho, em todas as páginas. No computador acompanha a rolagem; no celular, em versão compacta.',
  rodape: 'Barra no pé da tela do celular, acima do menu, depois que a pessoa rola a página — e nunca por cima de placar ou de candidato. Pode ser fechada e aparece de novo na próxima visita.',
  nativo: 'Cartão “Patrocinado” entre as seções da página inicial, da apuração, dos governadores, das curiosidades e da calculadora.',
  teste: 'Na tela de resultado do Teste Cego, depois que a pessoa revela e abaixo das ações de compartilhar: “Teste Cego oferecido por”.',
  tv: '“Oferecimento” com a sua logo na barra do topo do Modo TV, a tela cheia para transmissões e telões — fora do placar.',
  compartilhamento: '“Oferecimento: sua marca” no rodapé das imagens genéricas (Teste Cego, calculadora, capa das curiosidades) postadas no X e no WhatsApp. Nunca nas imagens de placar ou de candidato.',
};

const MASTER_PRIMEIRO: FormatoAnuncio[] = ['topo', 'tv', 'compartilhamento'];

function Formatos() {
  return (
    <Bloco
      id="formatos"
      eyebrow="Formatos"
      titulo="Seis formatos, todos identificados"
      descricao="Estes são os componentes do próprio site, com um anúncio de exemplo. A sua marca aparece exatamente assim."
    >
      <ol className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
        {FORMATOS_ANUNCIO.map((f, i) => (
          <li
            key={f}
            className={cn(
              'flex min-w-0 flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-card',
              f === 'nativo' && 'lg:col-span-2',
              // imagens de compartilhamento: linha inteira, texto ao lado da imagem (fecha a grade sem buraco)
              f === 'compartilhamento' && 'lg:col-span-2 lg:grid lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]',
            )}
          >
            <div className={cn('flex items-start gap-3 p-5 pb-4 sm:p-6 sm:pb-5', f === 'compartilhamento' && 'lg:self-center')}>
              <span className="num inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/15 text-[13px] font-bold text-brand-fg">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <h3 className="font-display text-[19px] font-semibold leading-tight tracking-[-0.02em] text-fg">{ROTULO_FORMATO[f]}</h3>
                  {MASTER_PRIMEIRO.includes(f) ? (
                    <span className="inline-flex h-[22px] items-center rounded-full bg-surface-3 px-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-muted">
                      Prioridade da cota master
                    </span>
                  ) : null}
                </div>
                <p className="mt-1.5 text-pretty text-[14px] leading-snug text-fg-muted">{ONDE[f]}</p>
              </div>
            </div>
            <div className={cn('flex flex-1 flex-col justify-center border-t border-line bg-bg/60 p-3 sm:p-5', f === 'compartilhamento' && 'lg:border-l lg:border-t-0')}>
              <VitrineFormato anuncio={EXEMPLO} formato={f} pecaPrevia={<PecaExemplo compacta />} />
            </div>
          </li>
        ))}
      </ol>
    </Bloco>
  );
}

// ---------------------------------------------------------------------------------------------------------------

function Cotas() {
  const cotas: { nome: string; destaque: string; itens: string[]; marca?: boolean }[] = [
    {
      nome: 'Master',
      destaque: 'Patrocinador principal',
      marca: true,
      itens: [
        'Prioridade na faixa do topo, no Modo TV e nas imagens de compartilhamento',
        'Pode aparecer também nos cartões do conteúdo, no rodapé do celular e no Teste Cego',
        'Período e formatos combinados com você',
      ],
    },
    {
      nome: 'Apoio',
      destaque: 'Presença em rotação',
      itens: [
        'Divide os formatos escolhidos com outros anunciantes, em rotação',
        'A frequência acompanha o peso combinado',
        'Nunca o mesmo anunciante em dois cartões da mesma página',
      ],
    },
  ];
  return (
    <Bloco id="cotas" eyebrow="Cotas" titulo="Master ou apoio" descricao="Valores e períodos sob consulta. Todos os anúncios têm data de início e de fim e podem ser pausados a qualquer momento.">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
        {cotas.map((c) => (
          <div
            key={c.nome}
            className={cn(
              'relative overflow-hidden rounded-3xl border bg-surface p-6 shadow-card sm:p-7',
              c.marca ? 'border-brand/40' : 'border-line',
            )}
          >
            {c.marca ? <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-brand/15 blur-3xl" /> : null}
            <p className="relative text-[12px] font-semibold uppercase tracking-[0.14em] text-fg-muted">{c.destaque}</p>
            <p className="relative mt-1 font-display text-[34px] font-semibold leading-none tracking-[-0.04em] text-fg">{c.nome}</p>
            <ul className="relative mt-5 space-y-2.5">
              {c.itens.map((t) => (
                <li key={t} className="flex gap-2.5 text-[14.5px] leading-snug text-fg-muted">
                  <Icon name="check" size={18} className="mt-px shrink-0 text-ok-fg" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Bloco>
  );
}

const REGRAS: { icone: IconName; titulo: string; texto: ReactNode }[] = [
  {
    icone: 'selo',
    titulo: 'Só anunciantes não políticos',
    texto: 'Candidatos, partidos, campanhas, órgãos públicos e peças com conteúdo político-eleitoral não são aceitos. O cadastro exige essa declaração e recusa nomes de candidatos, números, siglas e termos de eleição.',
  },
  { icone: 'info', titulo: 'Sempre identificado', texto: '“Publicidade”, “Patrocinado” ou “Oferecido por” em todo formato.' },
  {
    icone: 'grade',
    titulo: 'Separado dos resultados',
    texto: 'Nunca dentro do placar ou de um resultado, nem ao lado de foto, nome ou número de candidato.',
  },
  { icone: 'pause', titulo: 'Sem interrupção', texto: 'Sem pop-up, sem tela cheia, sem som e sem animação piscante.' },
  {
    icone: 'link',
    titulo: 'Links com UTM',
    texto: (
      <>
        O clique abre o seu site em nova aba com <span className="font-mono text-[13px] text-fg">utm_source=sintonia</span>, o formato em{' '}
        <span className="font-mono text-[13px] text-fg">utm_medium</span> (o do Teste Cego sai como <span className="font-mono text-[13px] text-fg">conteudo</span>)
        e o anúncio em <span className="font-mono text-[13px] text-fg">utm_campaign</span>, para você medir no seu analytics.
      </>
    ),
  },
  {
    icone: 'olho-fechado',
    titulo: 'Contagem honesta e sem dado pessoal',
    texto: 'Impressões e cliques são contados de forma agregada, sem cookie, sem guardar IP e sem identificar ninguém. Robôs, repetições e cliques vindos de fora do site não contam.',
  },
];

function Regras() {
  return (
    <Bloco id="regras" eyebrow="Regras" titulo="Publicidade que respeita quem acompanha a eleição">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        {REGRAS.map((r) => (
          <li key={r.titulo} className="flex gap-3.5 rounded-3xl border border-line bg-surface p-5 shadow-card">
            <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-fg-muted">
              <Icon name={r.icone} size={18} />
            </span>
            <div className="min-w-0">
              <h3 className="text-[15.5px] font-semibold leading-snug text-fg">{r.titulo}</h3>
              <p className="mt-1 text-pretty text-[14px] leading-relaxed text-fg-muted">{r.texto}</p>
            </div>
          </li>
        ))}
      </ul>
    </Bloco>
  );
}

function Envio() {
  const kb = (dataUri: number) => Math.round((((dataUri - 64) * 3) / 4 / 1024) / 10) * 10;
  const L = ANUNCIO_LIMITES;
  const itens: { item: string; detalhe: ReactNode }[] = [
    { item: 'Logo', detalhe: <>PNG, SVG, WebP ou JPEG, até <span className="num">{fmtInt(kb(L.logoDataUri))}</span> KB. Quadrada fica melhor.</> },
    { item: 'Peça (opcional)', detalhe: <>PNG, JPEG ou WebP, até <span className="num">{fmtInt(kb(L.imagemDataUri))}</span> KB, em qualquer proporção. Aparece inteira, sem corte.</> },
    { item: 'Chamada', detalhe: <>Até <span className="num">{fmtInt(L.titulo)}</span> caracteres.</> },
    { item: 'Texto de apoio', detalhe: <>Até <span className="num">{fmtInt(L.texto)}</span> caracteres.</> },
    { item: 'Botão', detalhe: <>Até <span className="num">{fmtInt(L.cta)}</span> caracteres, ex.: “Abrir conta”, “Saiba mais”.</> },
    { item: 'Link', detalhe: <>Endereço https do seu site (as UTMs são acrescentadas automaticamente).</> },
  ];
  return (
    <Bloco id="envio" eyebrow="O que enviar" titulo="O que você precisa">
      <div className="overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
        <dl className="divide-y divide-line">
          {itens.map((i) => (
            <div key={i.item} className="grid grid-cols-1 gap-1 px-5 py-4 sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-6 sm:px-6">
              <dt className="text-[14.5px] font-semibold text-fg">{i.item}</dt>
              <dd className="text-[14.5px] leading-relaxed text-fg-muted">{i.detalhe}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Bloco>
  );
}

function Contato({ zap, email, whatsapp, enderecoEmail }: { zap: string | null; email: string | null; whatsapp?: string; enderecoEmail?: string }) {
  const tem = !!(zap || email);
  return (
    <Bloco id="contato" eyebrow="Contato comercial" titulo="Vamos conversar">
      <div className="relative isolate overflow-hidden rounded-[32px] border border-brand/35 bg-surface p-6 shadow-card sm:p-10">
        <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 -z-10 h-72 w-72 rounded-full bg-brand/15 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-28 -right-20 -z-10 h-72 w-72 rounded-full bg-brand-2/10 blur-3xl" />
        {tem ? (
          <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-10">
            <div className="min-w-0">
              <p className="max-w-[40rem] text-pretty text-[16px] leading-relaxed text-fg-muted sm:text-[18px]">
                Conte o que você quer divulgar e em quais formatos. A mensagem já vai pronta: é só enviar.
              </p>
              <ul className="mt-4 space-y-1.5 text-[14.5px] text-fg-muted">
                {zap && whatsapp ? (
                  <li className="flex items-center gap-2">
                    <Icon name="whatsapp" size={16} className="text-fg-subtle" />
                    <span className="num">{fmtWhatsApp(whatsapp)}</span>
                  </li>
                ) : null}
                {email && enderecoEmail ? (
                  <li className="flex min-w-0 items-center gap-2">
                    <IconeQualquer name="carta" size={16} className="shrink-0 text-fg-subtle" />
                    <span className="truncate">{enderecoEmail}</span>
                  </li>
                ) : null}
              </ul>
            </div>
            <div className="flex flex-col gap-2.5 sm:flex-row lg:flex-col">
              {zap ? (
                <a href={zap} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: 'primary', size: 'lg' })}>
                  <Icon name="whatsapp" size={20} />
                  Falar no WhatsApp
                </a>
              ) : null}
              {email ? (
                <a href={email} className={buttonClasses({ variant: zap ? 'outline' : 'primary', size: 'lg' })}>
                  <IconeQualquer name="carta" size={20} />
                  Enviar e-mail
                </a>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between sm:gap-10">
            <div className="flex min-w-0 items-start gap-3.5">
              <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand-fg">
                <Icon name="relogio" size={19} />
              </span>
              <p className="max-w-[40rem] text-pretty text-[16px] leading-relaxed text-fg-muted sm:text-[17px]">
                <strong className="font-semibold text-fg">O contato comercial está sendo configurado.</strong> Enquanto isso, fale com a gente pelos
                canais da página <Link to="/sobre#contato" className="font-medium text-fg underline decoration-line/[3] underline-offset-[3px] hover:decoration-brand-fg">Sobre</Link>.
              </p>
            </div>
            <ButtonLink to="/sobre#contato" variant="outline" size="lg" iconRight="seta" className="shrink-0">
              Ver contatos
            </ButtonLink>
          </div>
        )}
      </div>
    </Bloco>
  );
}
