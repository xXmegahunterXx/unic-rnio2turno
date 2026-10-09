/**
 * /admin — sala de controle da simulação da noite da apuração (fora do AppShell público).
 * Sessão: tenta ler o estado; 401 → tela de login. Erro de rede sem dados → tela "servidor fora do ar".
 * Toda a interface fica em src/app/components/pages/admin/.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { getClient } from '@/app/data/client';
import { useAnonimizado, useRace, useRaces } from '@/app/data/hooks';
import { LogoMark } from '@/app/components/layout/Logo';
import { Button, Icon, Spinner, ThemeToggle } from '@/app/ui';
import {
  AdminProvider,
  CHAVE_SNAPSHOT,
  useExecutor,
  useNacionalAdmin,
  useSnapshotAdmin,
  type AdminCtx,
  type SnapshotRecebido,
} from '@/app/components/pages/admin/dados';
import { AdminLogin, Fundo } from '@/app/components/pages/admin/Login';
import { DialogoAtalhos, SalaDeControle, useConfirmacao } from '@/app/components/pages/admin/SalaDeControle';
import { ehSecao, mensagemErro, naoAutorizado, urlPublica, type SecaoId } from '@/app/components/pages/admin/rotulos';

type Sessao = 'verificando' | 'fora' | 'dentro';

export default function AdminPage() {
  const qc = useQueryClient();
  const [sessao, setSessao] = useState<Sessao>('verificando');
  const [avisoLogin, setAvisoLogin] = useState<string | null>(null);
  const q = useSnapshotAdmin(sessao !== 'fora');

  useEffect(() => {
    document.title = 'Sala de controle · Sintonia';
  }, []);

  useEffect(() => {
    if (q.error && naoAutorizado(q.error)) {
      qc.removeQueries({ queryKey: CHAVE_SNAPSHOT });
      setSessao('fora');
    } else if (q.data && sessao === 'verificando') setSessao('dentro');
  }, [q.error, q.data, sessao, qc]);

  const expirou = useCallback(() => {
    qc.removeQueries({ queryKey: CHAVE_SNAPSHOT });
    setAvisoLogin('Sua sessão expirou. Entre de novo para continuar.');
    setSessao('fora');
  }, [qc]);

  if (sessao === 'fora') {
    return (
      <AdminLogin
        aviso={avisoLogin}
        onEntrar={() => {
          setAvisoLogin(null);
          setSessao('verificando');
          void q.refetch();
        }}
      />
    );
  }

  if (!q.data) {
    if (q.isError) return <ForaDoAr erro={mensagemErro(q.error)} onTentar={() => void q.refetch()} tentando={q.isFetching} />;
    return <Carregando />;
  }

  return <Painel dados={q.data} offline={q.isError && !naoAutorizado(q.error)} onSessaoExpirada={expirou} onSair={() => setSessao('fora')} />;
}

function Painel({
  dados,
  offline,
  onSessaoExpirada,
  onSair,
}: {
  dados: SnapshotRecebido;
  offline: boolean;
  onSessaoExpirada: () => void;
  onSair: () => void;
}) {
  const qc = useQueryClient();
  // Corridas SEMPRE via useRaces/useRace: "Candidato A/B" quando a simulação está anonimizada.
  const races = useRaces();
  const pres = useRace('pres');
  const anon = useAnonimizado();
  const nacional = useNacionalAdmin('pres');
  const exec = useExecutor(onSessaoExpirada);
  const { confirmar, elemento: dialogo } = useConfirmacao();
  const [atalhos, setAtalhos] = useState(false);
  const [params, setParams] = useSearchParams();
  const s = params.get('s');
  const secao: SecaoId = ehSecao(s) ? s : 'controle';

  const irPara = useCallback(
    (id: SecaoId) => {
      setParams(
        (p) => {
          const n = new URLSearchParams(p);
          if (id === 'controle') n.delete('s');
          else n.set('s', id);
          return n;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const sair = useCallback(async () => {
    try {
      await (await getClient()).admin.logout();
    } catch {
      /* sai mesmo assim */
    }
    qc.removeQueries({ queryKey: CHAVE_SNAPSHOT });
    onSair();
  }, [qc, onSair]);

  const ctx: AdminCtx = useMemo(
    () => ({
      dados,
      snap: dados.snap,
      races,
      pres,
      anon,
      nacional: nacional.data,
      offline,
      run: exec.run,
      pendente: exec.pendente,
      pendenteDesde: exec.pendenteDesde,
      confirmar,
      secao,
      irPara,
      sair: () => void sair(),
      abrirAtalhos: () => setAtalhos(true),
    }),
    [dados, races, pres, anon, nacional.data, offline, exec, confirmar, secao, irPara, sair],
  );

  return (
    <AdminProvider value={ctx}>
      <SalaDeControle offline={offline} />
      {dialogo}
      <DialogoAtalhos aberto={atalhos} onFechar={() => setAtalhos(false)} />
    </AdminProvider>
  );
}

function Carregando() {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center bg-bg px-6" aria-busy="true">
      <Fundo />
      <div className="relative flex flex-col items-center text-center">
        <LogoMark size={48} />
        <p className="mt-5 inline-flex items-center gap-2 text-[14px] font-medium text-fg-muted">
          <Spinner size={16} className="text-brand-fg" />
          Conectando à sala de controle…
        </p>
      </div>
    </div>
  );
}

function ForaDoAr({ erro, onTentar, tentando }: { erro: string; onTentar: () => void; tentando: boolean }) {
  return (
    <div className="relative flex min-h-dvh flex-col bg-bg">
      <Fundo />
      <div className="relative flex items-center justify-between px-4 py-4 sm:px-6">
        <a href={urlPublica('/')} className="inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-[13px] font-medium text-fg-muted hover:text-fg">
          <Icon name="seta-esquerda" size={16} />
          Voltar ao site
        </a>
        <ThemeToggle size="sm" />
      </div>
      <main role="alert" className="relative flex flex-1 flex-col items-center justify-center px-6 pb-20 text-center">
        <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-alert/30 bg-alert/10 text-alert-fg">
          <Icon name="alerta" size={30} />
        </span>
        <h1 className="mt-5 font-display text-[26px] font-semibold tracking-[-0.02em] text-fg">Servidor fora do ar</h1>
        <p className="mt-2 max-w-md text-pretty text-[14.5px] leading-relaxed text-fg-muted">
          Não foi possível falar com o servidor da simulação. Confira se ele está rodando e a sua conexão.
        </p>
        <p className="mt-3 max-w-md rounded-xl border border-line bg-surface-2 px-3 py-2 font-mono text-[12px] text-fg-muted">{erro}</p>
        <Button variant="primary" icon="reset" className="mt-6" onClick={onTentar} loading={tentando}>
          Tentar de novo
        </Button>
      </main>
    </div>
  );
}
