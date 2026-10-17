/**
 * Faixa neutra "Conexão instável" (I05, leva 3): aparece presa sob o cabeçalho, em todas as páginas do AppShell,
 * quando o status falha 3 vezes seguidas ou quando as respostas chegam com o relógio do servidor parado há 60 s (status
 * velho servido pela borda). Diz só o fato e a hora do último dado recebido (a mesma da pílula "ao vivo": horário de
 * Brasília; na simulação, o relógio simulado); some sozinha na primeira resposta nova. Regras em
 * `src/app/data/carga.ts`; estado em `useConexaoInstavel` (hooks.ts). Chave 'faixa-conexao' no painel (Chaves da noite):
 * desligada, o status traz `semFaixaConexao` e a faixa não aparece (o recuo do status continua).
 *
 * Fora do JS inicial: o AppShell monta a região viva (`role="status"`) e carrega este arquivo só quando a conexão fica
 * instável — e o pré-carrega alguns segundos depois da abertura, para já estar no aparelho quando a rede falhar.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { fmtHoraSeg } from '@/shared/format';
import { useConexaoInstavel } from '@/app/data/hooks';
import { Icon } from '@/app/ui/Icon';
import { Container } from './Container';

export function FaixaConexao() {
  const { instavel, ultimoDado } = useConexaoInstavel();
  return (
    // a região viva (role="status") fica no AppShell, sempre montada: o leitor de tela anuncia quando a faixa aparece
    <AnimatePresence initial={false}>
        {instavel ? (
          <motion.div
            key="faixa-conexao"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
            data-faixa-conexao
          >
            {/* fundo opaco: a faixa fica presa sob o cabeçalho e o conteúdo rola por baixo */}
            <div className="border-b border-line bg-surface-2">
              <Container wide className="flex min-h-8 items-center justify-center py-1.5 text-center text-[12.5px] leading-snug text-fg-muted">
                <p className="min-w-0 text-balance">
                  <Icon name="relogio" size={14} className="mr-1.5 inline-block -translate-y-px align-middle text-fg-subtle" />
                  <span className="font-semibold text-fg">Conexão instável</span>
                  {ultimoDado !== null ? (
                    <>
                      {' '}— mostrando o último dado recebido às <span className="num font-medium text-fg">{fmtHoraSeg(ultimoDado)}</span>
                    </>
                  ) : (
                    <> — tentando de novo</>
                  )}
                </p>
              </Container>
            </div>
          </motion.div>
        ) : null}
    </AnimatePresence>
  );
}
