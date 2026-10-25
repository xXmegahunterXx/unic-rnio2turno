/**
 * Seção "Chat ao vivo" do painel (pensada para o celular): abrir/fechar a sala (FECHADA por padrão), modo lento,
 * mensagem fixada, denunciadas (manter/apagar), mensagens recentes (apagar, silenciar o autor pelo hash anonimizado),
 * silenciados, recusas automáticas e "limpar tudo". Fala com `GET/POST /api/admin/chat` (src/server/chat.ts); no build
 * demo não há servidor e a seção só explica.
 *
 * O autor aparece só como um código curto (hash da rede com sal + token do navegador): nada de IP.
 */
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { HORA_FIM_VOTACAO } from '@/shared/diaVotacao';
import { DIA_ELEICAO_17H, DIA_ELEICAO_INICIO, EMOJI_REACAO, LIMITES_CHAT, REACOES, type ChatAdmin, type ComandoChat, type MensagemAdmin, type MotivoRecusa } from '@/shared/chat';
import { fmtHora, fmtInt } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { Badge, Button, Segmented, toast } from '@/app/ui';
import { useAdmin } from './dados';
import { AreaTexto, CabecalhoSecao, Callout, Painel, Rotulo } from './kit';

const CHAVE = ['admin', 'chat'] as const;

const ROTULO_RECUSA: Record<MotivoRecusa, string> = {
  fechada: 'Sala fechada',
  apelido: 'Apelido recusado',
  vazia: 'Vazia',
  longa: 'Longa demais',
  link: 'Link ou perfil',
  dados: 'Dados pessoais',
  ofensa: 'Ofensa/palavrão/ameaça',
  propaganda: 'Propaganda/pedido de voto',
  fraude: 'Fraude nas urnas',
  repeticao: 'Repetição',
  duplicada: 'Duplicada',
  lento: 'Modo lento',
  limite: 'Limite por hora/rede',
  silenciado: 'Autor silenciado',
  token: 'Sem token',
};

const LENTOS = [5, 10, 20, 30, 60] as const;

class ErroChat extends Error {
  constructor(
    readonly status: number,
    msg: string,
  ) {
    super(msg);
  }
}

async function pedir(metodo: 'GET' | 'POST', corpo?: ComandoChat): Promise<ChatAdmin> {
  const r = await fetch('/api/admin/chat', {
    method: metodo,
    credentials: 'same-origin',
    headers: corpo ? { 'content-type': 'application/json', accept: 'application/json' } : { accept: 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const j = (await r.json().catch(() => ({}))) as ChatAdmin & { erro?: string };
  if (!r.ok) throw new ErroChat(r.status, j.erro ?? `Erro ${r.status}`);
  return j;
}

export function SecaoChat() {
  if (__DEMO__) {
    return (
      <div>
        <Cabecalho />
        <Callout tom="neutro" titulo="Só no servidor">
          O chat ao vivo guarda as mensagens na memória do servidor do Sintonia. Nesta prévia estática não há servidor: a sala aparece desligada para os
          visitantes, com um aviso.
        </Callout>
      </div>
    );
  }
  return <SecaoChatServidor />;
}

function Cabecalho() {
  return (
    <CabecalhoSecao
      titulo="Chat ao vivo"
      icone="usuarios"
      descricao="A Sala da apuração: chat moderado ao lado do placar (desktop), num botão no celular e em /ao-vivo. Fechada por padrão."
    />
  );
}

function SecaoChatServidor() {
  const { confirmar } = useAdmin();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: CHAVE, queryFn: () => pedir('GET'), refetchInterval: 3000, refetchIntervalInBackground: false });
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cmd = async (c: ComandoChat, sucesso: string, chave: string = c.acao) => {
    setOcupado(chave);
    try {
      qc.setQueryData(CHAVE, await pedir('POST', c));
      toast(sucesso, { tone: 'ok' });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível aplicar.', { tone: 'alert' });
    } finally {
      setOcupado(null);
    }
  };

  const d = q.data;
  if (!d) {
    return (
      <div>
        <Cabecalho />
        {q.isError ? (
          <Callout tom="alerta" titulo="Não foi possível carregar o chat">
            {q.error instanceof Error ? q.error.message : 'Tente de novo em instantes.'}
          </Callout>
        ) : (
          <p className="text-[14px] text-fg-muted">Carregando…</p>
        )}
      </div>
    );
  }

  const recusadas = Object.values(d.contadores.recusadas).reduce((s, n) => s + (n ?? 0), 0);
  const silenciar = async (m: MensagemAdmin, minutos: number, rede = false) => {
    const prazo = minutos >= 60 ? `${minutos / 60} h` : `${minutos} min`;
    const ok = await confirmar({
      titulo: rede ? `Silenciar a rede de “${m.apelido}” por ${prazo}?` : `Silenciar “${m.apelido}” por ${prazo}?`,
      descricao: rede
        ? 'Para quem troca de navegador/token a cada mensagem. As mensagens de TODOS os autores desta rede saem da sala e ninguém dela consegue enviar até o fim do prazo — numa rede compartilhada (operadora de celular, empresa) isso pode pausar outras pessoas.'
        : 'As mensagens deste autor saem da sala e ele não consegue enviar outras até o fim do prazo.',
      confirmar: 'Silenciar',
      perigo: true,
    });
    if (ok) void cmd({ acao: 'silenciar', autor: m.autor, minutos, rede }, rede ? 'Rede silenciada' : 'Autor silenciado', `sil-${m.id}`);
  };
  const apagar = (m: MensagemAdmin) => void cmd({ acao: 'apagar', id: m.id }, 'Mensagem apagada', `apagar-${m.id}`);

  return (
    <div>
      <Cabecalho />
      <div className="grid grid-cols-1 gap-4 lg:gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Painel
          titulo="Sala"
          icone="ao-vivo"
          subtitulo="Abra na noite da apuração. Fechada, a sala fica só leitura e o botão some das páginas."
          acoes={
            d.bloqueio && d.aberta ? (
              <Badge tone="alert" size="sm" caps>
                Aguardando {HORA_FIM_VOTACAO}
              </Badge>
            ) : d.aberta ? (
              <Badge tone="ok" size="sm" dot caps>
                Aberta
              </Badge>
            ) : (
              <Badge tone="neutral" size="sm" caps>
                Fechada
              </Badge>
            )
          }
        >
          <div className="space-y-4">
            {d.aberta ? (
              <Button variant="outline" block icon="pause" loading={ocupado === 'fechar'} onClick={() => void cmd({ acao: 'fechar' }, 'Sala fechada')}>
                Fechar a sala
              </Button>
            ) : (
              <Button
                variant="primary"
                block
                icon="play"
                disabled={!!d.travada}
                loading={ocupado === 'abrir'}
                onClick={() => void cmd({ acao: 'abrir' }, d.bloqueio ? `Sala aberta: recebe mensagens às ${HORA_FIM_VOTACAO} de 25/10` : 'Sala aberta')}
              >
                Abrir a sala
              </Button>
            )}
            {d.travada ? (
              <Callout tom="alerta" titulo="Sala travada pelo servidor">
                {d.travada}
              </Callout>
            ) : d.bloqueio ? (
              <Callout tom="alerta" titulo={d.agora >= DIA_ELEICAO_INICIO && d.agora < DIA_ELEICAO_17H ? 'Dia da eleição' : 'Antes da apuração'}>
                {d.bloqueio} Até lá ninguém consegue enviar mensagens, mesmo com a sala aberta
                {d.agora >= DIA_ELEICAO_INICIO && d.agora < DIA_ELEICAO_17H ? ' (propaganda no dia da eleição é crime)' : ''}. Com a sala aberta, ela
                volta a receber mensagens sozinha às {HORA_FIM_VOTACAO}, quando termina a votação. A configuração (aberta, modo lento, fixada) sobrevive a reinícios.
              </Callout>
            ) : null}
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Numero rotulo="Na sala agora" valor={d.pessoas} dica="estimativa" />
              <Numero rotulo="Publicadas" valor={d.contadores.publicadas} />
              <Numero rotulo="Recusadas" valor={recusadas} />
              <Numero rotulo="Denúncias" valor={d.contadores.denuncias} />
            </dl>
            <div>
              <Rotulo className="mb-2">Modo lento (1 mensagem por pessoa a cada)</Rotulo>
              <Segmented<string>
                ariaLabel="Modo lento"
                size="sm"
                options={LENTOS.map((s) => ({ value: String(s), label: `${s} s` }))}
                value={String(LENTOS.includes(d.lentoS as (typeof LENTOS)[number]) ? d.lentoS : 10)}
                onChange={(v) => void cmd({ acao: 'lento', segundos: Number(v) }, `Modo lento: ${v} s`, 'lento')}
              />
              <p className="mt-1.5 text-[12.5px] text-fg-muted">
                Atual: <span className="num font-semibold text-fg">{d.lentoS} s</span> · no máximo {LIMITES_CHAT.porHora} mensagens por hora por pessoa.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-fg-muted">
              <span>Reações no último minuto:</span>
              {REACOES.map((r) => (
                <span key={r} className="num inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5">
                  {EMOJI_REACAO[r]} {fmtInt(d.reacoes[r])}
                </span>
              ))}
              <span className="basis-full text-[12px] text-fg-subtle">O público vê só o total, nunca por emoji.</span>
            </div>
          </div>
        </Painel>

        <Fixada atual={d.fixada?.texto ?? null} ocupado={ocupado === 'fixar'} onFixar={(t) => void cmd({ acao: 'fixar', texto: t }, t ? 'Mensagem fixada' : 'Mensagem fixada removida', 'fixar')} />

        <Painel
          titulo="Denunciadas"
          icone="alerta"
          subtitulo={`Com ${d.limiarDenuncias ?? LIMITES_CHAT.denuncias} denúncias de redes diferentes (de quem está na sala há 2 min) a mensagem some até você decidir. O número sobe com a sala cheia.`}
          acoes={d.denunciadas.length ? <Badge tone="alert" size="sm"><span className="num">{d.denunciadas.length}</span></Badge> : null}
          className="xl:col-span-2"
        >
          {d.alertaDenuncias && d.alertaDenuncias.redes > 0 ? (
            <Callout tom="alerta" titulo="Possível grupo escondendo mensagens" className="mb-3">
              <span className="num">{d.alertaDenuncias.redes}</span> {d.alertaDenuncias.redes === 1 ? 'rede ajudou' : 'redes ajudaram'} a esconder 3 ou mais mensagens na
              última hora (<span className="num">{d.alertaDenuncias.ocultadasHora}</span> escondidas por denúncia). Revise as escondidas abaixo e use “Manter” nas
              que não ferem as regras — principalmente se forem todas de um mesmo lado.
            </Callout>
          ) : null}
          {d.denunciadas.length === 0 ? (
            <p className="text-[13.5px] text-fg-muted">Nenhuma mensagem denunciada.</p>
          ) : (
            <ul className="divide-y divide-line">
              {d.denunciadas.map((m) => (
                <LinhaMensagem key={m.id} m={m} ocupado={ocupado} onApagar={apagar} onSilenciar={silenciar} onManter={(x) => void cmd({ acao: 'manter', id: x.id }, 'Mensagem mantida na sala', `manter-${x.id}`)} />
              ))}
            </ul>
          )}
        </Painel>

        <Painel titulo="Mensagens recentes" icone="lista" subtitulo="As mais novas primeiro. O autor é um código anonimizado (sem IP)." className="xl:col-span-2" semPadding>
          {d.mensagens.length === 0 ? (
            <p className="px-4 pb-4 pt-4 text-[13.5px] text-fg-muted sm:px-5">Nenhuma mensagem na sala.</p>
          ) : (
            <ul className="max-h-[560px] divide-y divide-line overflow-y-auto overscroll-contain px-4 pt-2 sm:px-5">
              {[...d.mensagens].reverse().map((m) => (
                <LinhaMensagem key={m.id} m={m} ocupado={ocupado} onApagar={apagar} onSilenciar={silenciar} />
              ))}
            </ul>
          )}
        </Painel>

        <Painel titulo="Silenciados" icone="olho-fechado" subtitulo="Autores (ou redes inteiras) que não conseguem enviar até o prazo acabar.">
          {d.silenciados.length === 0 ? (
            <p className="text-[13.5px] text-fg-muted">Ninguém silenciado.</p>
          ) : (
            <ul className="divide-y divide-line">
              {d.silenciados.map((s) => (
                <li key={s.autor} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold text-fg">
                      {s.apelido || 'sem apelido'}
                      {s.rede ? <span className="ml-1.5 text-[12px] font-medium text-alert-fg">rede inteira</span> : null}
                    </p>
                    <p className="text-[12px] text-fg-muted">
                      <span className="font-mono">{s.autor}</span> · até <span className="num">{fmtHora(s.ate)}</span>
                    </p>
                  </div>
                  <Button size="sm" variant="outline" loading={ocupado === `lib-${s.autor}`} onClick={() => void cmd({ acao: 'liberar', autor: s.autor }, s.rede ? 'Rede liberada' : 'Autor liberado', `lib-${s.autor}`)}>
                    Liberar
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Painel>

        <Painel titulo="Recusas automáticas" icone="grafico" subtitulo="Mensagens barradas pelos filtros desde que o servidor subiu (só contagem).">
          {recusadas === 0 ? (
            <p className="text-[13.5px] text-fg-muted">Nenhuma recusa ainda.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-[13.5px] sm:grid-cols-2">
              {(Object.entries(d.contadores.recusadas) as [MotivoRecusa, number][])
                .sort((a, b) => b[1] - a[1])
                .map(([k, n]) => (
                  <li key={k} className="flex items-center justify-between gap-3">
                    <span className="text-fg-muted">{ROTULO_RECUSA[k] ?? k}</span>
                    <span className="num font-semibold text-fg">{fmtInt(n)}</span>
                  </li>
                ))}
            </ul>
          )}
        </Painel>

        <Painel titulo="Limpar tudo" icone="reset" subtitulo="Apaga todas as mensagens da sala para todo mundo (a sala continua como está)." className="xl:col-span-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Callout tom="neutro" className="flex-1">
              Nada é gravado em disco: reiniciar o servidor também esvazia a sala e a deixa fechada. Antes de abrir, combine quem modera e apague na hora
              propaganda, ofensas e notícias falsas.
            </Callout>
            <Button
              variant="outline"
              icon="reset"
              className="border-alert/40 text-alert-fg hover:bg-alert/10"
              loading={ocupado === 'limpar'}
              onClick={async () => {
                const ok = await confirmar({ titulo: 'Limpar todas as mensagens?', descricao: 'Elas somem da tela de todo mundo em poucos segundos. Não dá para desfazer.', confirmar: 'Limpar tudo', perigo: true });
                if (ok) void cmd({ acao: 'limpar' }, 'Sala limpa');
              }}
            >
              Limpar tudo
            </Button>
          </div>
        </Painel>
      </div>
    </div>
  );
}

function Numero({ rotulo, valor, dica }: { rotulo: string; valor: number | null; dica?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2/60 px-3 py-2.5">
      <dt className="text-[11.5px] font-medium text-fg-muted">{rotulo}</dt>
      <dd className="num mt-1 font-display text-[20px] font-semibold leading-none text-fg">
        {valor === null ? '—' : fmtInt(valor)}
        {dica && valor !== null ? <span className="ml-1 align-middle font-sans text-[10.5px] font-medium text-fg-subtle">{dica}</span> : null}
      </dd>
    </div>
  );
}

function Fixada({ atual, ocupado, onFixar }: { atual: string | null; ocupado: boolean; onFixar: (t: string | null) => void }) {
  const [texto, setTexto] = useState(atual ?? '');
  useEffect(() => {
    if (atual && !texto) setTexto(atual);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atual]);
  const limpo = texto.trim();
  return (
    <Painel
      titulo="Mensagem fixada"
      icone="pin"
      subtitulo="Aparece no topo da sala, como “Moderação”. Use para boas-vindas, regras ou um aviso."
      acoes={atual ? <Badge tone="brand" size="sm" caps>No ar</Badge> : null}
    >
      <div className="space-y-3">
        <AreaTexto
          rotulo="Texto"
          value={texto}
          maxLength={LIMITES_CHAT.fixada}
          placeholder="Ex.: Boa noite! Sala moderada: sem propaganda, ofensas ou links. Resultado oficial: TSE."
          onChange={(e) => setTexto(e.target.value)}
          dica={
            <div className="flex items-center justify-between gap-3">
              <span>Neutro e descritivo, sem torcida.</span>
              <span className="num shrink-0">
                {texto.length}/{LIMITES_CHAT.fixada}
              </span>
            </div>
          }
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="md" loading={ocupado} disabled={!limpo || limpo === atual} onClick={() => onFixar(limpo)}>
            {atual ? 'Atualizar' : 'Fixar'}
          </Button>
          {atual ? (
            <Button
              variant="ghost"
              size="md"
              onClick={() => {
                setTexto('');
                onFixar(null);
              }}
            >
              Tirar
            </Button>
          ) : null}
        </div>
      </div>
    </Painel>
  );
}

function LinhaMensagem({
  m,
  ocupado,
  onApagar,
  onSilenciar,
  onManter,
}: {
  m: MensagemAdmin;
  ocupado: string | null;
  onApagar: (m: MensagemAdmin) => void;
  onSilenciar: (m: MensagemAdmin, minutos: number, rede?: boolean) => void;
  onManter?: (m: MensagemAdmin) => void;
}) {
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12.5px]">
        <span className="font-semibold text-fg">{m.apelido}</span>
        <span className="num text-fg-subtle">{fmtHora(m.em)}</span>
        <span className="font-mono text-[11.5px] text-fg-subtle" title="Autor (código anonimizado)">
          {m.autor}
        </span>
        {m.denuncias > 0 ? (
          <Badge tone={m.oculta ? 'alert' : 'neutral'} size="xs">
            <span className="num">{m.denuncias}</span>&nbsp;{m.denuncias === 1 ? 'denúncia' : 'denúncias'}
            {m.oculta ? ' · escondida' : m.revisada ? ' · mantida' : ''}
          </Badge>
        ) : null}
      </div>
      <p className={cn('mt-1 break-words text-[14px] leading-snug [overflow-wrap:anywhere]', m.oculta ? 'text-fg-muted' : 'text-fg')}>{m.texto}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {onManter && m.oculta ? (
          <Button size="sm" variant="outline" loading={ocupado === `manter-${m.id}`} onClick={() => onManter(m)}>
            Manter
          </Button>
        ) : null}
        <Button size="sm" variant="outline" className="text-alert-fg" loading={ocupado === `apagar-${m.id}`} onClick={() => onApagar(m)}>
          Apagar
        </Button>
        <Button size="sm" variant="ghost" loading={ocupado === `sil-${m.id}`} onClick={() => onSilenciar(m, 60)}>
          Silenciar 1 h
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onSilenciar(m, 24 * 60)}>
          24 h
        </Button>
        <Button size="sm" variant="ghost" className="text-alert-fg" onClick={() => onSilenciar(m, 60, true)} title="Para quem troca de navegador a cada mensagem">
          Silenciar a rede 1 h
        </Button>
      </div>
    </li>
  );
}
