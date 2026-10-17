/**
 * Bloco "Chaves da noite" (leva 3, seção Controle): os interruptores operacionais gravados em `AdminState.noite`
 * (src/shared/chaves-noite.ts) — freio de carga (I37), "pessoas agora" no site (I09), HTML na borda (I05), medição dos
 * anúncios (I11), aviso do arquivo nacional parado (I18), texto para bots (I22) e contagem de lives (I23) — e, desde a
 * integração da leva 3, as peças novas da noite: faixa "Conexão instável" (I05), carimbo do print (I10), placar na prévia
 * dos links (I07a), medição por estado/país/aparelho (I14) e a pausa por bloqueio do TSE (I03).
 *
 * Valem na hora, para todos os visitantes, sem publicar nada. No servidor as chaves NÃO sobem a versão do estado (não
 * invalidam o cache de ninguém): por isso uma consulta do painel que saiu antes do comando pode trazer o valor anterior
 * por ~1 s — o bloco mostra o valor confirmado pelo comando por alguns segundos, em vez de "piscar" de volta.
 * Também pelo SSH: `deploy/painel.sh freio 2`, `painel.sh chaves` (ver o script).
 */
import { useState, type ReactNode } from 'react';
import type { AdminCommand } from '@/shared/api';
import type { ChavesNoite, FatorCarga, ModoAvisoNacional, ModoPausaTse } from '@/shared/types';
import { CHAVES_NOITE_PADRAO, ROTULO_CHAVE, chavesNoite, type ComandoChave } from '@/shared/chaves-noite';
import { PISO_PESSOAS_PUBLICO } from '@/shared/constants';
import { fmtDecimal, fmtInt } from '@/shared/format';
import { STATUS_MS, fatorDe } from '@/app/data/carga';
import { pollMs } from '@/app/data/hooks';
import { cn } from '@/app/lib/cn';
import { Badge, Segmented, Toggle } from '@/app/ui';
import { useAdmin } from './dados';
import { Painel, Rotulo } from './kit';

/** Quanto tempo o painel confia no valor que o comando devolveu, à frente de consultas atrasadas (ms). */
const CONFIA_MS = 3000;

const OPCOES_FREIO: { value: `${FatorCarga}`; label: string; ariaLabel: string }[] = [
  { value: '1', label: 'Normal', ariaLabel: 'Ritmo normal' },
  { value: '2', label: '2×', ariaLabel: 'Freio 2 vezes' },
  { value: '3', label: '3×', ariaLabel: 'Freio 3 vezes' },
  { value: '5', label: '5×', ariaLabel: 'Freio 5 vezes' },
];

const OPCOES_AVISO: { value: ModoAvisoNacional; label: string }[] = [
  { value: 'auto', label: 'Automático' },
  { value: 'off', label: 'Desligado' },
];

const OPCOES_PAUSA: { value: ModoPausaTse; label: string; ariaLabel: string }[] = [
  { value: 'auto', label: 'Automática', ariaLabel: 'Pausa automática' },
  { value: 'restrita', label: 'Só sinal claro', ariaLabel: 'Pausa só com sinal claro' },
  { value: 'off', label: 'Desligada', ariaLabel: 'Pausa desligada' },
];

const SUCESSO_PAUSA: Record<ModoPausaTse, string> = {
  auto: 'Pausa por bloqueio do TSE: automática',
  restrita: 'Pausa por bloqueio do TSE: só com sinal claro',
  off: 'Pausa por bloqueio do TSE: desligada',
};

/** Peças novas da noite (integração da leva 3): todas ligadas por padrão; desligar volta ao site de antes delas. */
const PECAS_NOVAS: { cmd: ComandoChave; campo: 'faixaConexao' | 'carimboPrint' | 'metaPlacar' | 'medirLocal'; descricao: string }[] = [
  {
    cmd: 'faixa-conexao',
    campo: 'faixaConexao',
    descricao: 'Avisa “Conexão instável — mostrando o último dado recebido às HH:MM:SS” quando o servidor não responde. Desligada, o site só espera.',
  },
  {
    cmd: 'carimbo-print',
    campo: 'carimboPrint',
    descricao: 'Linha “sintonia2026.com.br · X% apurado · hora” dentro dos mapas e no pé do placar. Desligada, some em todas as telas.',
  },
  {
    cmd: 'meta-placar',
    campo: 'metaPlacar',
    descricao: 'O placar entra na descrição dos links no WhatsApp e no X. Desligado, as descrições ficam sem números.',
  },
  {
    cmd: 'medir-local',
    campo: 'medirLocal',
    descricao: 'Conta as páginas por estado, país e celular/computador (só siglas). Desligada, só essa parte da audiência para.',
  },
];

/** Segundos com 1 casa só quando precisa ("2 s", "7,5 s"). */
const seg = (ms: number) => `${fmtDecimal(ms / 1000, Number.isInteger(ms / 1000) ? 0 : 1)} s`;

/** Chaves fora do padrão (o freio conta como uma). */
export function foraDoPadrao(c: ChavesNoite): number {
  const p = CHAVES_NOITE_PADRAO;
  let n = c.freio.fator !== p.freio.fator || c.freio.leve !== p.freio.leve ? 1 : 0;
  for (const k of [
    'contadorPublico',
    'htmlBorda',
    'medirAnuncios',
    'textoBots',
    'contarLives',
    'avisoNacional',
    'faixaConexao',
    'carimboPrint',
    'metaPlacar',
    'medirLocal',
    'pausaTse',
  ] as const) {
    if (c[k] !== p[k]) n++;
  }
  return n;
}

export function ChavesDaNoite({ className }: { className?: string }) {
  const { snap, run, pendente, confirmar } = useAdmin();
  const [confirmado, setConfirmado] = useState<{ chaves: ChavesNoite; ate: number } | null>(null);
  const doEstado = chavesNoite(snap.state);
  const c = confirmado && Date.now() < confirmado.ate ? confirmado.chaves : doEstado;
  const fora = foraDoPadrao(c);

  async function enviar(cmd: AdminCommand, chave: string, sucesso: string) {
    const r = await run(cmd, { chave, sucesso });
    if (r) setConfirmado({ chaves: chavesNoite(r.state), ate: Date.now() + CONFIA_MS });
  }

  const freio = (fator: FatorCarga, leve: boolean) =>
    enviar(
      { tipo: 'freio', fator, leve },
      'noite-freio',
      fator === 1 ? (leve ? 'Modo leve ligado (ritmo normal)' : 'Freio solto: ritmo normal') : `Freio ${fator}×${leve ? ', modo leve' : ''}`,
    );

  async function alternar(cmd: ComandoChave, ligado: boolean) {
    if (cmd === 'html-borda' && ligado) {
      const ok = await confirmar({
        titulo: 'Guardar o HTML na borda?',
        descricao:
          'A Cloudflare passa a guardar as páginas por 15 s e segura o site se o servidor cair. Combinado para depois do ensaio, no congelamento (24/10, 12h). Antes de publicar uma versão nova, desligue e espere 30 s.',
        confirmar: 'Ligar',
      });
      if (!ok) return;
    }
    if (cmd === 'medir-anuncios' && !ligado) {
      const ok = await confirmar({
        titulo: 'Parar de contar as impressões?',
        descricao: 'Enquanto estiver desligado, as impressões dos anúncios não são contadas e o relatório dos anunciantes fica sem esse período.',
        confirmar: 'Parar de contar',
        perigo: true,
      });
      if (!ok) return;
    }
    await enviar({ tipo: cmd, ligado } as AdminCommand, `noite-${cmd}`, `${ROTULO_CHAVE[cmd]}: ${ligado ? 'ligado' : 'desligado'}`);
  }

  async function mudarPausa(modo: ModoPausaTse) {
    if (modo === 'off') {
      const ok = await confirmar({
        titulo: 'Desligar a pausa por bloqueio?',
        descricao:
          'O servidor continua lendo o TSE mesmo quando ele limita as leituras (429 ou 403). Use só se a pausa estiver disparando por engano; o risco de um bloqueio mais longo aumenta. Uma pausa em curso termina agora.',
        confirmar: 'Desligar a pausa',
        perigo: true,
      });
      if (!ok) return;
    }
    await enviar({ tipo: 'pausa-tse', modo }, 'noite-pausa-tse', SUCESSO_PAUSA[modo]);
  }

  const puxado = c.freio.fator > 1 || c.freio.leve;
  const statusMs = STATUS_MS * fatorDe(c.freio);
  // o que o site faz com o freio mostrado (o status do painel pode estar ~1 s atrás do comando)
  const placarMs = pollMs({ ...snap.status, carga: puxado ? { fator: c.freio.fator, ...(c.freio.leve ? { leve: true } : {}) } : undefined }, 'br');

  return (
    <Painel
      id="chaves-da-noite"
      className={className}
      titulo="Chaves da noite"
      icone="ajustes"
      subtitulo="Valem na hora, para todos os visitantes, sem publicar nada."
      acoes={
        fora ? (
          <Badge tone={puxado ? 'alert' : 'brand'} size="sm">
            <span className="num">{fmtInt(fora)}</span> fora do padrão
          </Badge>
        ) : (
          <Badge tone="ok" size="sm" icon="check">
            Tudo no padrão
          </Badge>
        )
      }
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-5">
        {/* Freio de carga (I37) */}
        <div
          data-freio={puxado ? c.freio.fator : undefined}
          className={cn('rounded-2xl border p-4 lg:self-start', puxado ? 'border-alert/40 bg-alert/[0.07]' : 'border-line bg-surface-2/60')}
        >
          <div className="flex items-center justify-between gap-3">
            <Rotulo>Freio de carga</Rotulo>
            {puxado ? (
              <Badge tone="alert" size="sm" caps>
                Puxado
              </Badge>
            ) : (
              <Badge tone="ok" size="sm" caps>
                Normal
              </Badge>
            )}
          </div>
          <p className="mt-2 text-pretty text-[13px] leading-snug text-fg-muted">
            Espaça as consultas de todos os visitantes. Use se o servidor ou a borda apertarem e solte quando normalizar.
          </p>
          <Segmented
            className="mt-3"
            block
            ariaLabel="Freio de carga"
            options={OPCOES_FREIO.map((o) => ({ ...o, disabled: pendente('noite-freio') }))}
            value={`${c.freio.fator}` as `${FatorCarga}`}
            onChange={(v) => void freio(Number(v) as FatorCarga, c.freio.leve)}
          />
          <Toggle
            className="mt-4"
            checked={c.freio.leve}
            onChange={(v) => void freio(c.freio.fator, v)}
            disabled={pendente('noite-freio')}
            label="Modo leve"
            description="Para de atualizar o mapa por município e o “desde o 1º turno” e deixa o chat 2× mais lento."
          />
          <p className="mt-4 border-t border-line pt-3 text-[12.5px] leading-snug text-fg-muted">
            Agora: status a cada <span className="num font-semibold text-fg">{seg(statusMs)}</span>
            {placarMs !== false ? (
              <>
                {' '}
                · placar nacional a cada <span className="num font-semibold text-fg">{seg(placarMs)}</span>
              </>
            ) : null}
            {c.freio.leve ? <> · mapa por município parado</> : null}.
          </p>
        </div>

        {/* demais chaves */}
        <ul className="divide-y divide-[rgb(var(--line)/var(--line-alpha))] rounded-2xl border border-line">
          <Linha>
            <Toggle
              checked={c.contadorPublico}
              onChange={(v) => void alternar('contador-publico', v)}
              disabled={pendente('noite-contador-publico')}
              label={ROTULO_CHAVE['contador-publico']}
              description={`Mostra “N pessoas agora” a partir de ${fmtInt(PISO_PESSOAS_PUBLICO)} pessoas ao mesmo tempo. Desligado, só o painel vê.`}
            />
          </Linha>
          <Linha>
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2.5">
              <div className="min-w-0 flex-[1_1_14rem]">
                <span className="block text-sm font-medium text-fg">Aviso do arquivo nacional parado</span>
                <span className="mt-0.5 block text-pretty text-[13px] text-fg-muted">
                  Automático: se o arquivo do Brasil parar enquanto os estados andam, o site avisa “o arquivo nacional do TSE não atualiza desde
                  HH:MM · veja os estados”.
                </span>
              </div>
              <Segmented
                size="sm"
                ariaLabel="Aviso do arquivo nacional parado"
                options={OPCOES_AVISO.map((o) => ({ ...o, disabled: pendente('noite-aviso-nacional') }))}
                value={c.avisoNacional}
                onChange={(modo) =>
                  void enviar({ tipo: 'aviso-nacional', modo }, 'noite-aviso-nacional', modo === 'auto' ? 'Aviso do arquivo nacional: automático' : 'Aviso do arquivo nacional: desligado')
                }
              />
            </div>
          </Linha>
          <Linha>
            <Toggle
              checked={c.htmlBorda}
              onChange={(v) => void alternar('html-borda', v)}
              disabled={pendente('noite-html-borda')}
              label={ROTULO_CHAVE['html-borda']}
              description="Liga só depois do ensaio, no congelamento (24/10, 12h). Antes de publicar uma versão nova, desligue e espere 30 s."
            />
          </Linha>
          <Linha>
            <Toggle
              checked={c.medirAnuncios}
              onChange={(v) => void alternar('medir-anuncios', v)}
              disabled={pendente('noite-medir-anuncios')}
              label={ROTULO_CHAVE['medir-anuncios']}
              description="Desligado, o servidor recebe e não conta: alivia a carga, mas o relatório dos anunciantes fica sem esse período."
            />
          </Linha>
          <Linha>
            <Toggle
              checked={c.textoBots}
              onChange={(v) => void alternar('texto-bots', v)}
              disabled={pendente('noite-texto-bots')}
              label={ROTULO_CHAVE['texto-bots']}
              description="Responde o !apuracao do Nightbot e do StreamElements com o placar. Desligado, responde só o endereço do site."
            />
          </Linha>
          <Linha>
            <Toggle
              checked={c.contarLives}
              onChange={(v) => void alternar('contar-lives', v)}
              disabled={pendente('noite-contar-lives')}
              label={ROTULO_CHAVE['contar-lives']}
              description="Conta quantas lives exibem o Sintonia, sem identificar canal nem pessoa. Desligado, nada é contado."
            />
          </Linha>
        </ul>
      </div>

      {/* peças novas da leva 3: chave para desligar cada uma, sem publicar */}
      <div className="mt-4">
        <Rotulo>Peças novas da noite · padrão ligadas</Rotulo>
        <ul className="mt-2 grid grid-cols-1 divide-y divide-[rgb(var(--line)/var(--line-alpha))] rounded-2xl border border-line lg:grid-cols-2 lg:divide-y-0">
          {PECAS_NOVAS.map((p, i) => (
            <li key={p.cmd} className={cn('px-4 py-3.5', i >= 2 && 'lg:border-t lg:border-line', i % 2 === 1 && 'lg:border-l lg:border-line')}>
              <Toggle
                checked={c[p.campo]}
                onChange={(v) => void alternar(p.cmd, v)}
                disabled={pendente(`noite-${p.cmd}`)}
                label={ROTULO_CHAVE[p.cmd]}
                description={p.descricao}
              />
            </li>
          ))}
          <li className="px-4 py-3.5 lg:col-span-2 lg:border-t lg:border-line">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2.5">
              <div className="min-w-0 flex-[1_1_14rem]">
                <span className="block text-sm font-medium text-fg">Pausa das leituras quando o TSE bloqueia</span>
                <span className="mt-0.5 block text-pretty text-[13px] text-fg-muted">
                  Automática: pausa com 429, com a borda do TSE ou com 403 num arquivo já lido. Só sinal claro: ignora o último caso
                  (falso positivo repetido). Desligada: nunca pausa, como antes — risco maior de bloqueio.
                </span>
              </div>
              <Segmented
                size="sm"
                ariaLabel="Pausa das leituras quando o TSE bloqueia"
                options={OPCOES_PAUSA.map((o) => ({ ...o, disabled: pendente('noite-pausa-tse') }))}
                value={c.pausaTse}
                onChange={(modo) => void mudarPausa(modo)}
              />
            </div>
          </li>
        </ul>
      </div>
      <p className="mt-4 text-pretty text-[12.5px] leading-snug text-fg-subtle">
        {__DEMO__ ? 'Na demonstração, só o freio tem efeito (as outras chaves agem no servidor). ' : null}
        Pelo SSH: <span className="font-mono text-[11.5px] text-fg-muted">deploy/painel.sh freio 2</span> e{' '}
        <span className="font-mono text-[11.5px] text-fg-muted">deploy/painel.sh chaves</span>.
      </p>
    </Painel>
  );
}

function Linha({ children }: { children: ReactNode }) {
  return <li className="px-4 py-3.5">{children}</li>;
}
