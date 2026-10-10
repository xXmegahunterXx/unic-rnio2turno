/**
 * Cartão "Minha cidade no 1º turno": resultado OFICIAL do município (os dois que foram ao 2º turno + demais),
 * com comparecimento, brancos e nulos. Dado real: fotos oficiais quando a corrida tem (nunca com nomes ocultos).
 */
import type { Race, UF } from '@/shared/types';
import { pctValidos, validos } from '@/shared/calc';
import { fmtInt, fmtPct } from '@/shared/format';
import { cn } from '@/app/lib/cn';
import { corSlot } from '@/app/lib/raceUi';
import type { ButtonSize, ButtonVariant } from '@/app/ui/Button';
import { useFotosRace } from '@/app/components/apuracao/fotos';
import { BotaoCompartilhar } from '../BotaoCompartilhar';
import { CartaoBase, SeloOficial, useCartao } from '../CartaoBase';
import { hashtags, textoMunicipioT1 } from '../textos';
import type { FormatoCartao } from '../tipos';
import { AvatarCartao, PctGigante, RotuloCartao } from './partes';

export interface ResultadoLocalT1 {
  votos: number[];
  brancos: number;
  nulos: number;
  comparecimento: number;
  eleitorado: number;
}

export interface CartaoMunicipioT1Props {
  formato: FormatoCartao;
  nome: string;
  uf: UF;
  /** Corrida do 1º turno (exibição: 2 finalistas + "Outros"). */
  race: Race;
  t: ResultadoLocalT1;
  caminho: string;
}

const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);

export function CartaoMunicipioT1({ formato, nome, uf, race, t, caminho }: CartaoMunicipioT1Props) {
  const fotos = useFotosRace(race, { real: true });
  return (
    <CartaoBase
      formato={formato}
      sobrancelha="Resultado oficial · 1º turno"
      caminho={caminho}
      instante={null}
      fonte="Fonte: TSE · votação de 4 de outubro"
      selo={<SeloOficial>Resultado oficial</SeloOficial>}
      brilho="duelo"
    >
      <Miolo nome={nome} uf={uf} race={race} t={t} fotos={fotos} />
    </CartaoBase>
  );
}

function Miolo({ nome, uf, race, t, fotos }: Omit<CartaoMunicipioT1Props, 'formato' | 'caminho'> & { fotos: (string | undefined)[] }) {
  const { k, retrato, formato } = useCartao();
  const v = validos(t);
  const maior = Math.max(1, ...race.candidatos.map((_, i) => pctValidos(t, i)));
  const linhas = race.candidatos.map((c, i) => ({ c, i }));
  return (
    <div className="flex flex-1 flex-col justify-center" style={{ gap: (retrato ? 40 : 14) * k, paddingTop: (retrato ? 20 : 14) * k, paddingBottom: (retrato ? 20 : 12) * k }}>
      <div className={cn(!retrato && 'flex items-end justify-between')} style={{ gap: 20 * k }}>
        <div>
          <RotuloCartao>
            {race.cargo} · {uf === 'ZZ' ? 'Exterior' : uf}
          </RotuloCartao>
          <div className="font-display font-semibold leading-[1.02] tracking-[-0.03em]" style={{ fontSize: (formato === 'story' ? 50 : retrato ? 54 : 36) * k, marginTop: 10 * k }}>
            Minha cidade no 1º turno
          </div>
        </div>
        <div className="truncate font-display font-semibold leading-[1.25] tracking-[-0.03em] text-fg-muted" style={{ fontSize: (retrato ? 40 : 30) * k, marginTop: retrato ? 8 * k : 0 }}>
          {nome}
        </div>
      </div>

      <div className="flex flex-col" style={{ gap: (retrato ? 30 : 12) * k }}>
        {linhas.map(({ c, i }) => {
          const p = v > 0 ? pctValidos(t, i) : 0;
          return (
            <div key={`${c.numero}-${i}`} className="flex items-center" style={{ gap: 20 * k }}>
              {c.agregado ? (
                <div className="flex shrink-0 items-center justify-center rounded-full bg-surface-3 font-display font-semibold text-fg-muted" style={{ width: (retrato ? 76 : 54) * k, height: (retrato ? 76 : 54) * k, fontSize: 20 * k }}>
                  ···
                </div>
              ) : (
                <AvatarCartao cor={c.cor} nome={c.nomeUrna} size={Math.round((retrato ? 76 : 54) * k)} foto={fotos[i]} />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between" style={{ gap: 16 * k }}>
                  <div className="min-w-0">
                    <div className="truncate font-display font-semibold leading-tight tracking-[-0.02em]" style={{ fontSize: (retrato ? 34 : 26) * k }}>
                      {c.agregado ? 'Demais candidatos' : c.nomeUrna}
                    </div>
                    <div className="num truncate text-fg-muted" style={{ fontSize: 16 * k }}>
                      {c.agregado ? '' : `${c.partido} · ${c.numero} · `}
                      {fmtInt(t.votos[i] ?? 0)} votos
                    </div>
                  </div>
                  <PctGigante valor={p} size={(retrato ? 70 : 48) * k} cor={c.agregado ? null : c.cor} apagado={c.agregado} />
                </div>
                <div className="overflow-hidden rounded-full bg-surface-3" style={{ height: (retrato ? 14 : 9) * k, marginTop: 8 * k }}>
                  <div className={cn('h-full rounded-full', corSlot(c.cor).bg)} style={{ width: `${(p / maior) * 100}%` }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-3 rounded-[0.9em] border border-line/[2] bg-surface/70" style={{ padding: `${(retrato ? 20 : 12) * k}px ${22 * k}px`, gap: 16 * k }}>
        {[
          ['Comparecimento', fmtPct(pct(t.comparecimento, t.eleitorado), 1), `${fmtInt(t.comparecimento)} eleitores`],
          ['Brancos', fmtPct(pct(t.brancos, t.comparecimento), 1), `${fmtInt(t.brancos)} votos`],
          ['Nulos', fmtPct(pct(t.nulos, t.comparecimento), 1), `${fmtInt(t.nulos)} votos`],
        ].map(([r, a, b]) => (
          <div key={r} className="min-w-0">
            <div className="truncate font-semibold uppercase tracking-[0.1em] text-fg-muted" style={{ fontSize: 13 * k }}>
              {r}
            </div>
            <div className="num font-display font-semibold leading-tight text-fg" style={{ fontSize: (retrato ? 32 : 24) * k }}>
              {a}
            </div>
            <div className="num truncate text-fg-muted" style={{ fontSize: 14 * k }}>
              {b}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export interface BotaoCompartilharMunicipioT1Props {
  nome: string;
  uf: UF;
  race: Race;
  t: ResultadoLocalT1;
  caminho: string;
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  soIcone?: boolean;
}

export function BotaoCompartilharMunicipioT1({ nome, uf, race, t, caminho, label = 'Minha cidade no 1º turno', ...botao }: BotaoCompartilharMunicipioT1Props) {
  return (
    <BotaoCompartilhar
      {...botao}
      label={label}
      titulo="Minha cidade no 1º turno"
      descricao={`${nome} · ${race.cargo} · resultado oficial de 4 de outubro.`}
      texto={textoMunicipioT1(nome, uf, race, t)}
      caminho={caminho}
      hashtags={hashtags('primeiroTurno')}
      nomeArquivo={`sintonia-1turno-${uf.toLowerCase()}-${nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
      formatos={['feed', 'x', 'story']}
      cartao={(f) => <CartaoMunicipioT1 formato={f} nome={nome} uf={uf} race={race} t={t} caminho={caminho.split('?')[0]} />}
    />
  );
}
