/**
 * Seção de confiança da Home: apartidário · dados oficiais do TSE · suas respostas nunca saem do seu
 * celular — com links para Metodologia, Privacidade e Sobre.
 */
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/app/lib/cn';
import { Icon, type IconName } from '@/app/ui/Icon';

const PILARES: { icone: IconName; titulo: string; texto: string; link: { to: string; label: string } }[] = [
  {
    icone: 'selo',
    titulo: 'Apartidário',
    texto:
      'Sem vínculo com candidatos, partidos ou campanhas. As cores seguem a ordem do número na urna, nunca as dos partidos, e os textos descrevem, sem torcida.',
    link: { to: '/sobre', label: 'Sobre o Sintonia' },
  },
  {
    icone: 'urna',
    titulo: 'Dados oficiais do TSE',
    texto:
      'Os resultados vêm do site oficial de divulgação do TSE e os mapas, das malhas do IBGE. Não fazemos enquetes: nunca mostramos preferência de usuários.',
    link: { to: '/metodologia', label: 'Metodologia' },
  },
  {
    icone: 'olho-fechado',
    titulo: 'Suas respostas nunca saem do seu celular',
    texto:
      'O Teste Cego roda inteiro no seu navegador: sem cadastro, sem envio e sem analytics das suas respostas. O resultado vive só no link.',
    link: { to: '/privacidade', label: 'Privacidade' },
  },
];

export function Confianca({ className }: { className?: string }) {
  const reduzir = useReducedMotion();
  return (
    <section aria-labelledby="home-confianca" className={cn('min-w-0', className)}>
      <div className="max-w-[40rem]">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-brand-fg">Por que confiar</p>
        <h2 id="home-confianca" className="mt-1.5 text-balance font-display text-[26px] font-semibold leading-tight tracking-[-0.03em] text-fg sm:text-[34px]">
          Feito para informar, não para torcer
        </h2>
      </div>
      <ul className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-4">
        {PILARES.map((p, i) => (
          <motion.li
            key={p.titulo}
            initial={reduzir ? false : { y: 18 }}
            whileInView={{ y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.5, delay: reduzir ? 0 : i * 0.08, ease: [0.22, 0.9, 0.24, 1] }}
            className="flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6"
          >
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-brand/25 bg-brand/[0.12] text-brand-fg">
              <Icon name={p.icone} size={22} />
            </span>
            <h3 className="mt-4 text-balance font-display text-[19px] font-semibold leading-snug tracking-[-0.015em] text-fg">{p.titulo}</h3>
            <p className="mt-2 text-pretty text-[14px] leading-relaxed text-fg-muted">{p.texto}</p>
            <Link
              to={p.link.to}
              className="group mt-auto inline-flex items-center gap-1 self-start rounded-md pt-4 text-[13.5px] font-semibold text-fg transition-colors hover:text-brand-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {p.link.label}
              <Icon name="chevron-direita" size={15} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}
