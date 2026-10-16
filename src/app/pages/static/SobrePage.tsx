/**
 * /sobre — o que é o Sintonia, princípios (neutralidade, precisão, privacidade, beleza), apartidarismo,
 * anúncios só de marcas não políticas (contagem agregada, sem cookie e sem guardar IP) e contato — os e-mails e o responsável
 * pelo site vêm do painel (Comunicação → Contatos públicos); sem configuração, nenhuma linha de e-mail aparece. A seção
 * "Equipe" saiu enquanto os nomes não estão definidos (CHECKLIST-LANCAMENTO A9.2): placeholder no site público não.
 */
import { REGRA_CORES } from '@/shared/cores';
import { OFERECIMENTO_COM_CANDIDATOS } from '@/shared/oferecimento';
import { formatarCnpj } from '@/shared/contatos';
import { useContatos } from '@/app/data/contatos';
import { ButtonLink } from '@/app/ui/Button';
import {
  Destaque,
  Email,
  Lista,
  LinkInterno,
  PaginaInstitucional,
  Resumo,
  Secao,
} from '@/app/components/pages/home/Institucional';

const SUMARIO = [
  { id: 'o-que-e', titulo: 'O que é' },
  { id: 'principios', titulo: 'Princípios' },
  { id: 'apartidario', titulo: 'Apartidário' },
  { id: 'contato', titulo: 'Fale com a gente' },
];

export default function SobrePage() {
  const c = useContatos();
  return (
    <PaginaInstitucional
      tituloAba="Sobre"
      eyebrow="Sobre o Sintonia"
      icone="info"
      titulo="Informar bem, sem torcer"
      lead="O Sintonia é um projeto independente para acompanhar a apuração do 2º turno de 2026 com precisão e clareza, do Brasil inteiro até a sua seção. E para conhecer as ideias dos candidatos pelo que elas dizem, não por quem as assina."
      sumario={SUMARIO}
      destaque={
        <Resumo
          itens={[
            { icone: 'ao-vivo', titulo: 'Apuração ao vivo', texto: 'Presidente e governadores, estado por estado, cidade por cidade e seção por seção, com os dados oficiais do TSE.' },
            { icone: 'olho-fechado', titulo: 'Teste Cego', texto: 'Propostas reais dos programas de governo, sem nome nem partido. Você escolhe e só depois descobre de quem eram.' },
            { icone: 'busca', titulo: 'Sua seção', texto: 'Encontre a urna onde você vota e veja o boletim dela assim que for totalizada.' },
          ]}
        />
      }
    >
      <Secao id="o-que-e" titulo="O que é">
        <p>
          Em 25 de outubro, milhões de brasileiros vão acompanhar a apuração pelo celular. O Sintonia nasceu para que essa experiência seja{' '}
          <strong>rápida, bonita e confiável</strong>: o placar nacional, os 27 estados, os mais de 5.500 municípios e cada uma das seções
          eleitorais, com os números conferidos e explicados.
        </p>
        <p>
          Antes da eleição, o <LinkInterno to="/teste">Teste Cego</LinkInterno> convida a concordar ou discordar de afirmações tiradas dos
          planos de governo sem saber de quem são, uma forma de olhar para ideias antes de nomes. Depois, você pode <strong>desafiar alguém</strong> e ver em quantos temas vocês concordam.
        </p>
      </Secao>

      <Secao id="principios" titulo="Princípios">
        <p>Quando há dúvida, decidimos nesta ordem:</p>
        <Lista
          numerada
          itens={[
            <>
              <strong>Neutralidade.</strong> Os dois candidatos sempre do mesmo tamanho e na mesma ordem (a da urna), textos descritivos.{' '}
              {REGRA_CORES}
            </>,
            <>
              <strong>Precisão.</strong> Percentuais calculados como o TSE calcula, fontes citadas e simulação sempre sinalizada.
            </>,
            <>
              <strong>Beleza.</strong> Informação clara no celular, rápida em qualquer conexão e acessível para todos.
            </>,
          ]}
        />
        <p>
          E a privacidade atravessa tudo: <LinkInterno to="/privacidade">suas respostas nunca saem do seu aparelho</LinkInterno>.
        </p>
      </Secao>

      <Secao id="apartidario" titulo="Apartidário">
        <Lista
          itens={[
            <>Não temos vínculo com candidatos, partidos, coligações ou campanhas, e não recebemos recursos deles.</>,
            <>
              <strong>Não exibimos propaganda política.</strong> Os espaços de anúncio aceitam apenas anunciantes não políticos, sempre
              identificados como publicidade e separados dos resultados: nunca dentro do placar nem ao lado de foto, nome ou número de candidato.
              {OFERECIMENTO_COM_CANDIDATOS
                ? ' Nas imagens de compartilhamento do placar e do Palpite, o anunciante aparece só numa faixa de texto “Oferecimento” no pé, abaixo da marca do Sintonia.'
                : null}
            </>,
            <>
              Dos anúncios, medimos só totais de impressões e cliques, sem cookie e sem guardar IP. Os links patrocinados levam
              marcadores de campanha (UTM) que dizem ao anunciante apenas que a visita veio do Sintonia.{' '}
              <LinkInterno to="/privacidade#anuncios">Como funciona</LinkInterno>.
            </>,
            <>Não fazemos enquetes nem mostramos preferência de usuários.</>,
            <>
              Fotos de candidatos, só as oficiais do TSE, com o mesmo tamanho e tratamento para todos e sem edição. Nunca usamos imagens geradas
              por inteligência artificial.
            </>,
          ]}
        />
        <Destaque icone="info">
          O Sintonia não é um site oficial da Justiça Eleitoral. Os resultados oficiais são os divulgados pelo Tribunal Superior Eleitoral. Saiba como
          trabalhamos na <LinkInterno to="/metodologia">metodologia</LinkInterno>.
        </Destaque>
      </Secao>

      <Secao id="contato" titulo="Fale com a gente">
        {c.responsavel ? (
          <p>
            O Sintonia é mantido por <strong className="font-semibold text-fg">{c.responsavel}</strong>
            {c.cnpj ? (
              <>
                , CNPJ <span className="num">{formatarCnpj(c.cnpj)}</span>
              </>
            ) : null}
            .
          </p>
        ) : null}
        <ul className="space-y-2.5">
          {c.geral ? (
            <li>
              Geral: <Email endereco={c.geral} />
            </li>
          ) : null}
          {c.imprensa ? (
            <li>
              Imprensa: <Email endereco={c.imprensa} />
            </li>
          ) : null}
          {c.correcoes ? (
            <li>
              Correções: <Email endereco={c.correcoes} />
            </li>
          ) : null}
          {c.privacidade ? (
            <li>
              Privacidade e dados pessoais: <Email endereco={c.privacidade} /> (<LinkInterno to="/privacidade">política de privacidade</LinkInterno>)
            </li>
          ) : null}
          {c.carregado && !c.algum ? <li>Os e-mails de contato do Sintonia serão publicados aqui em breve.</li> : null}
          <li>
            Anunciar: veja os formatos em <LinkInterno to="/anuncie">Anuncie no Sintonia</LinkInterno>
          </li>
        </ul>
        <div className="flex flex-col gap-2.5 pt-2 sm:flex-row">
          <ButtonLink to="/apuracao" variant="primary" size="lg" icon="ao-vivo">
            Ir para a apuração
          </ButtonLink>
          <ButtonLink to="/teste" variant="secondary" size="lg" icon="olho-fechado">
            Fazer o Teste Cego
          </ButtonLink>
        </div>
      </Secao>
    </PaginaInstitucional>
  );
}
