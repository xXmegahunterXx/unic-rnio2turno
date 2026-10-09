/**
 * Tela de entrada do painel de simulação. Senha → `admin.login()`. No demo mostra a dica da senha.
 */
import { useState, type FormEvent } from 'react';
import { motion, useAnimationControls } from 'framer-motion';
import { getClient } from '@/app/data/client';
import { LogoMark } from '@/app/components/layout/Logo';
import { Button, Icon, ThemeToggle } from '@/app/ui';
import { cn } from '@/app/lib/cn';
import { mensagemErro, statusErro, urlPublica } from './rotulos';

export function AdminLogin({ onEntrar, aviso }: { onEntrar: () => void; aviso?: string | null }) {
  const [senha, setSenha] = useState('');
  const [ver, setVer] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const tremor = useAnimationControls();

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!senha || carregando) return;
    setCarregando(true);
    setErro(null);
    try {
      const c = await getClient();
      const ok = await c.admin.login(senha);
      if (ok) {
        onEntrar();
        return;
      }
      setErro('Senha incorreta.');
      void tremor.start({ x: [0, -10, 9, -6, 4, 0], transition: { duration: 0.42 } });
    } catch (err) {
      const st = statusErro(err);
      setErro(st === 0 ? 'Servidor fora do ar. Verifique a conexão e tente de novo.' : mensagemErro(err));
    } finally {
      setCarregando(false);
    }
  }

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
      <main className="relative flex flex-1 items-center justify-center px-4 pb-16">
        <motion.div animate={tremor} className="w-full max-w-[400px]">
          <div className="mb-7 flex flex-col items-center text-center">
            <span className="relative">
              <span aria-hidden className="absolute inset-0 rounded-2xl bg-brand/40 blur-2xl" />
              <LogoMark size={56} className="relative" />
            </span>
            <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-fg">Sintonia · Admin</p>
            <h1 className="mt-2 font-display text-[30px] font-semibold leading-tight tracking-[-0.025em] text-fg">Sala de controle</h1>
            <p className="mt-2 max-w-xs text-pretty text-[14px] leading-relaxed text-fg-muted">
              Simule a noite da apuração: relógio, cenário, estados, avisos e fonte dos dados.
            </p>
          </div>
          <form onSubmit={enviar} className="rounded-3xl border border-line bg-surface p-5 shadow-card sm:p-6" noValidate>
            {aviso ? (
              <p role="status" className="mb-4 flex items-start gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-[13px] text-fg-muted">
                <Icon name="info" size={16} className="mt-px shrink-0 text-brand-fg" />
                {aviso}
              </p>
            ) : null}
            <label htmlFor="admin-senha" className="mb-1.5 block text-[13px] font-medium text-fg-muted">
              Senha
            </label>
            <div className="relative">
              <input
                id="admin-senha"
                type={ver ? 'text' : 'password'}
                autoComplete="current-password"
                autoFocus
                value={senha}
                onChange={(e) => {
                  setSenha(e.target.value);
                  if (erro) setErro(null);
                }}
                aria-invalid={erro ? true : undefined}
                aria-describedby={erro ? 'admin-senha-erro' : __DEMO__ ? 'admin-senha-dica' : undefined}
                className={cn(
                  'h-12 w-full rounded-xl border bg-surface-2 pl-4 pr-24 text-[15px] text-fg placeholder:text-fg-subtle',
                  'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/45',
                  erro ? 'border-alert/60' : 'border-line focus-visible:border-brand/60',
                )}
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setVer((v) => !v)}
                aria-label={ver ? 'Ocultar senha' : 'Mostrar senha'}
                aria-pressed={ver}
                className="absolute right-1.5 top-1/2 inline-flex h-9 -translate-y-1/2 items-center justify-center rounded-lg px-2.5 text-[12.5px] font-medium text-fg-muted hover:bg-surface-3 hover:text-fg"
              >
                {ver ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
            {erro ? (
              <p id="admin-senha-erro" role="alert" className="mt-2 flex items-center gap-1.5 text-[13px] font-medium text-alert-fg">
                <Icon name="alerta" size={15} />
                {erro}
              </p>
            ) : null}
            <Button type="submit" variant="primary" size="lg" block loading={carregando} disabled={!senha} className="mt-4">
              Entrar
            </Button>
            {__DEMO__ ? (
              <p id="admin-senha-dica" className="mt-4 rounded-xl border border-dashed border-line px-3 py-2.5 text-center text-[13px] text-fg-muted">
                Demonstração · senha: <span className="font-mono font-semibold text-fg">sintonia</span>
              </p>
            ) : null}
          </form>
          <p className="mt-5 text-center text-[12.5px] leading-relaxed text-fg-subtle">
            Acesso restrito. As mudanças feitas aqui aparecem em tempo real para todos os visitantes.
          </p>
        </motion.div>
      </main>
    </div>
  );
}

/** Fundo da sala de controle: grade de pontos sutil + brilho violeta (tokens). */
export function Fundo() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(rgb(var(--fg)/0.07)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_75%)]" />
      <div className="absolute left-1/2 top-[-280px] h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-brand/[0.08] blur-[100px] dark:bg-brand/[0.16]" />
    </div>
  );
}
