/**
 * Cartão da ficha do candidato (dado real do TSE): foto oficial (mesmo recorte para todos, sem edição), nome de
 * urna, número, partido (cor neutra da paleta de partidos, sempre com a sigla), cargo e o resultado no 1º turno.
 */
import type { CandidatoFicha } from '@/shared/dataset';
import type { UF } from '@/shared/types';
import { UF_NOMES } from '@/shared/constants';
import { fmtInt, fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { useFotoCandidato } from '@/app/data/estatico';
import type { ButtonSize, ButtonVariant } from '@/app/ui/Button';
import { Icon } from '@/app/ui/Icon';
import { iniciais } from '@/app/components/apuracao/CandidateAvatar';
import { corPartido } from '@/app/components/pages/cargos/partidos';
import { BotaoCompartilhar } from '../BotaoCompartilhar';
import { CartaoBase, SeloOficial, useCartao } from '../CartaoBase';
import { hashtags, textoCandidato } from '../textos';
import type { FormatoCartao } from '../tipos';
import { RotuloCartao } from './partes';

export interface CartaoCandidatoProps {
  formato: FormatoCartao;
  ficha: CandidatoFicha;
  /** Cargo de exibição (com gênero): "Senadora". */
  cargo: string;
  /** Situação por extenso ("Eleita", "2º turno"…). */
  situacao?: string;
  caminho: string;
  /** Vice: sem resultado próprio. */
  semResultado?: boolean;
}

export function CartaoCandidato({ formato, ficha, cargo, situacao, caminho, semResultado }: CartaoCandidatoProps) {
  return (
    <CartaoBase
      formato={formato}
      sobrancelha="Ficha do candidato · 2026"
      caminho={caminho}
      instante={null}
      fonte="Fonte: TSE · dados públicos de candidatura"
      selo={<SeloOficial>Dados oficiais</SeloOficial>}
      brilho="marca"
    >
      <Miolo ficha={ficha} cargo={cargo} situacao={situacao} semResultado={semResultado} />
    </CartaoBase>
  );
}

function Retrato({ ficha, w }: { ficha: CandidatoFicha; w: number }) {
  const foto = useFotoCandidato({ sqcand: ficha.sqcand, fotoGrupo: ficha.fotoGrupo }, { real: true });
  const h = Math.round((w * 4) / 3);
  return (
    <div className="relative shrink-0 overflow-hidden bg-surface-3 shadow-card" style={{ width: w, height: h, borderRadius: w * 0.1, boxShadow: '0 0 0 1px rgb(var(--line) / 0.12)' }}>
      {foto ? (
        <img src={foto} alt="" className="h-full w-full object-cover object-top" />
      ) : (
        <div className="flex h-full w-full items-center justify-center font-display font-semibold text-fg-muted" style={{ fontSize: w * 0.3 }}>
          {iniciais(ficha.nomeUrna)}
        </div>
      )}
    </div>
  );
}

function Miolo({ ficha: f, cargo, situacao, semResultado }: Omit<CartaoCandidatoProps, 'formato' | 'caminho'>) {
  const { k, retrato, formato } = useCartao();
  const local = f.uf === 'BR' ? 'Brasil' : UF_NOMES[f.uf as UF];
  const r = semResultado ? undefined : f.resultado;
  const cor = corPartido(f.partido);
  const texto = (
    <div className={cn('min-w-0', retrato && 'text-center')}>
      <RotuloCartao>
        {cargo} · {local}
      </RotuloCartao>
      <div className="text-balance font-display font-semibold leading-[0.98] tracking-[-0.035em]" style={{ fontSize: (formato === 'story' ? 76 : retrato ? 70 : 56) * (f.nomeUrna.length > 18 ? 0.8 : 1) * (retrato ? 1 : k), marginTop: 12 * k }}>
        {f.nomeUrna}
      </div>
      <div className="truncate text-fg-muted" style={{ fontSize: 19 * k, marginTop: 8 * k }}>
        {f.nome}
      </div>
      <div className={cn('flex flex-wrap items-center', retrato && 'justify-center')} style={{ gap: 12 * k, marginTop: 18 * k }}>
        <span className="num rounded-[0.35em] border border-line/[2.5] bg-surface-2 font-mono font-semibold text-fg" style={{ fontSize: 24 * k, padding: `${4 * k}px ${12 * k}px` }}>
          {f.numero}
        </span>
        <span className="inline-flex items-center rounded-full border border-line/[2.5] bg-surface/80 font-semibold text-fg" style={{ gap: 10 * k, fontSize: 21 * k, padding: `${5 * k}px ${16 * k}px` }}>
          <span className="shrink-0 rounded-[3px]" style={{ width: 14 * k, height: 14 * k, background: cor }} />
          {f.partido}
        </span>
        {situacao ? (
          <span className="inline-flex items-center rounded-full bg-brand/15 font-bold uppercase tracking-[0.08em] text-brand-fg" style={{ gap: 8 * k, fontSize: 15 * k, padding: `${7 * k}px ${14 * k}px` }}>
            <Icon name="selo" size={17 * k} strokeWidth={2.2} />
            {situacao}
          </span>
        ) : null}
      </div>
      {r ? (
        <div className={cn('flex flex-wrap items-end border-t border-line', retrato && 'justify-center')} style={{ gap: 40 * k, marginTop: 24 * k, paddingTop: 20 * k }}>
          <div>
            <div className="font-semibold uppercase tracking-[0.1em] text-fg-muted" style={{ fontSize: 14 * k }}>
              Votos no 1º turno
            </div>
            <div className="num font-display font-semibold leading-none tracking-[-0.03em]" style={{ fontSize: 46 * k, marginTop: 8 * k }}>
              {fmtInt(r.votos)}
            </div>
          </div>
          <div>
            <div className="font-semibold uppercase tracking-[0.1em] text-fg-muted" style={{ fontSize: 14 * k }}>
              % dos válidos
            </div>
            <div className="num font-display font-semibold leading-none tracking-[-0.03em]" style={{ fontSize: 46 * k, marginTop: 8 * k }}>
              {fmtPct(r.pct)}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
  if (retrato) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center" style={{ gap: 40 * k }}>
        <Retrato ficha={f} w={Math.round((formato === 'story' ? 300 : 230) * k)} />
        {texto}
      </div>
    );
  }
  return (
    <div className="flex flex-1 items-center" style={{ gap: 44 }}>
      <Retrato ficha={f} w={270} />
      {texto}
    </div>
  );
}

export interface BotaoCompartilharCandidatoProps {
  ficha: CandidatoFicha;
  cargo: string;
  situacao?: string;
  semResultado?: boolean;
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  soIcone?: boolean;
}

export function BotaoCompartilharCandidato({ ficha, cargo, situacao, semResultado, label = 'Compartilhar', ...botao }: BotaoCompartilharCandidatoProps) {
  const caminho = `/candidato/${ficha.sqcand}`;
  const r = semResultado ? null : ficha.resultado;
  return (
    <BotaoCompartilhar
      {...botao}
      label={label}
      titulo="Compartilhar ficha"
      descricao={`${ficha.nomeUrna} · ${cargo} · dados públicos do TSE.`}
      texto={textoCandidato({ nomeUrna: ficha.nomeUrna, partido: ficha.partido, numero: ficha.numero, cargo, uf: ficha.uf, resultado: r ?? null, situacao })}
      caminho={caminho}
      hashtags={hashtags('candidato')}
      nomeArquivo={`sintonia-ficha-${ficha.sqcand}`}
      cartao={(f) => <CartaoCandidato formato={f} ficha={ficha} cargo={cargo} situacao={situacao} caminho={caminho} semResultado={semResultado} />}
    />
  );
}
