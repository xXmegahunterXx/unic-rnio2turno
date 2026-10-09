/**
 * /privacidade — LGPD em linguagem simples: não coletamos as respostas do Teste Cego (opinião política é dado
 * sensível), o que fica no navegador (com botão para apagar), sem cookies de rastreamento, dados técnicos
 * mínimos, direitos e contato (provisório).
 */
import { useState } from 'react';
import { Button } from '@/app/ui/Button';
import { toast } from '@/app/ui/Toast';
import {
  CONTATO,
  Destaque,
  Email,
  Ficha,
  Lista,
  LinkInterno,
  PaginaInstitucional,
  Resumo,
  Secao,
} from '@/app/components/pages/home/Institucional';

const SUMARIO = [
  { id: 'teste-cego', titulo: 'Teste Cego' },
  { id: 'navegador', titulo: 'O que fica no seu navegador' },
  { id: 'links', titulo: 'Links de resultado e Duelo' },
  { id: 'cookies', titulo: 'Cookies e analytics' },
  { id: 'tecnicos', titulo: 'Dados técnicos' },
  { id: 'direitos', titulo: 'Seus direitos' },
  { id: 'contato', titulo: 'Contato' },
];

/** Prefixo das chaves do Sintonia no armazenamento do navegador. O estado local do admin (demo) fica de fora. */
const PREFIXO = 'sintonia:';
const ehDoUsuario = (k: string) => k.startsWith(PREFIXO) && !k.startsWith('sintonia:admin');

function apagarDadosLocais(): number {
  let n = 0;
  for (const area of ['localStorage', 'sessionStorage'] as const) {
    try {
      const s = window[area];
      const chaves: string[] = [];
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        if (k && ehDoUsuario(k)) chaves.push(k);
      }
      for (const k of chaves) s.removeItem(k);
      n += chaves.length;
    } catch {
      /* armazenamento bloqueado: nada a apagar */
    }
  }
  return n;
}

export default function PrivacidadePage() {
  const [apagando, setApagando] = useState(false);
  function apagar() {
    setApagando(true);
    const n = apagarDadosLocais();
    window.setTimeout(() => {
      setApagando(false);
      toast(n > 0 ? 'Dados do Sintonia apagados deste navegador' : 'Não havia dados do Sintonia neste navegador', { tone: 'ok', icon: 'check' });
    }, 350);
  }

  return (
    <PaginaInstitucional
      tituloAba="Privacidade"
      eyebrow="Privacidade"
      icone="olho-fechado"
      titulo="Sua opinião é só sua"
      lead="O Sintonia foi feito para funcionar sem saber quem você é. As respostas do Teste Cego nunca saem do seu aparelho, e não usamos cookies de rastreamento."
      atualizado="9 de outubro de 2026"
      sumario={SUMARIO}
      destaque={
        <Resumo
          itens={[
            { icone: 'olho-fechado', titulo: 'Não coletamos suas respostas', texto: 'O Teste Cego roda inteiro no seu navegador. Nada é enviado, registrado ou somado.' },
            { icone: 'selo', titulo: 'Sem cookies de rastreamento', texto: 'Sem pixels de redes sociais, sem publicidade direcionada e sem analytics que identifiquem você.' },
            { icone: 'usuarios', titulo: 'Sem cadastro', texto: 'Não pedimos nome, e-mail, telefone nem login para nada no site.' },
          ]}
        />
      }
    >
      <Secao id="teste-cego" titulo="Teste Cego">
        <p>
          Opinião política é <strong>dado pessoal sensível</strong> pela Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018, art. 5º, II). Por
          isso o Teste Cego foi construído para que a gente <strong>nunca receba</strong> suas escolhas:
        </p>
        <Lista
          itens={[
            <>As propostas, o sorteio da ordem e o cálculo da sintonia acontecem no seu navegador.</>,
            <>Não há envio das respostas a servidor, nem registro, nem ferramenta de analytics com as escolhas.</>,
            <>
              Não fazemos enquetes: como não recebemos respostas, não temos como somá-las, e nunca mostramos preferência de usuários.
            </>,
          ]}
        />
      </Secao>

      <Secao id="navegador" titulo="O que fica no seu navegador">
        <p>
          Algumas preferências ficam guardadas <strong>só no seu aparelho</strong>, no armazenamento local do navegador, para o site lembrar de
          você sem precisar de conta. Nada disso é enviado para nós.
        </p>
        <Ficha
          legenda="Dados guardados no navegador"
          colunas={['O quê', 'Onde', 'Quanto tempo']}
          linhas={[
            ['Progresso do Teste Cego em andamento', 'Armazenamento da aba (sessionStorage)', 'Some ao fechar a aba'],
            ['Suas respostas a um Duelo', 'Armazenamento da aba (sessionStorage)', 'Some ao fechar a aba'],
            ['Tema claro ou escuro', 'Armazenamento local (localStorage)', 'Até você apagar'],
            ['Preferências de exibição (visão do mapa, ordem das listas)', 'Armazenamento local', 'Até você apagar'],
            ['“Minha seção”, se você salvar a sua na consulta', 'Armazenamento local', 'Até você apagar'],
          ]}
        />
        <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface-2/60 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <p className="text-[14.5px] leading-snug">
            <strong>Quer limpar tudo agora?</strong> Apague os dados do Sintonia guardados neste navegador.
          </p>
          <Button variant="secondary" icon="reset" loading={apagando} onClick={apagar} className="shrink-0">
            Apagar meus dados
          </Button>
        </div>
      </Secao>

      <Secao id="links" titulo="Links de resultado e Duelo">
        <p>
          O resultado do Teste Cego fica <strong>codificado no próprio link</strong>, depois do “#”. Essa parte do endereço não é enviada a
          servidor nenhum quando a página abre. Mas atenção: quem tiver o link consegue ver as escolhas. Compartilhe só com quem quiser.
        </p>
        <p>
          O <strong>Duelo</strong> funciona do mesmo jeito: o link leva as suas escolhas para a outra pessoa comparar no aparelho dela. O cartão de
          compartilhamento é gerado no seu aparelho, e o texto que o acompanha nunca diz em quem você vota.
        </p>
      </Secao>

      <Secao id="cookies" titulo="Cookies e analytics">
        <p>
          O site público <strong>não usa cookies</strong> de rastreamento, de publicidade ou de redes sociais. O único cookie do Sintonia é o de
          sessão do painel administrativo, usado só pela equipe. Se houver espaços de anúncio, eles aceitam apenas anunciantes não políticos e
          nunca têm acesso às suas respostas.
        </p>
      </Secao>

      <Secao id="tecnicos" titulo="Dados técnicos">
        <p>
          Como qualquer site, nossos servidores e a rede de distribuição de conteúdo recebem dados técnicos de cada acesso: endereço IP, data e
          hora, página pedida e tipo de navegador. Eles servem só para entregar o site, medir a carga de forma agregada e proteger contra abuso, e
          são guardados pelo prazo exigido pelo Marco Civil da Internet (Lei 12.965/2014, art. 15).
        </p>
        <Destaque icone="olho-fechado" tom="marca">
          Esses registros nunca contêm respostas do Teste Cego: elas não passam pelos nossos servidores.
        </Destaque>
      </Secao>

      <Secao id="direitos" titulo="Seus direitos">
        <p>
          A LGPD garante a você, entre outros, o direito de saber quais dados tratamos, de corrigi-los e de pedir que sejam apagados (art. 18).
          Como não guardamos dados pessoais seus além dos registros técnicos, quase tudo se resolve no seu próprio aparelho: use o botão “Apagar
          meus dados” acima ou limpe os dados do site no navegador.
        </p>
        <p>
          Veja também a <LinkInterno to="/metodologia">metodologia</LinkInterno> e a página <LinkInterno to="/sobre">sobre o Sintonia</LinkInterno>.
        </p>
      </Secao>

      <Secao id="contato" titulo="Contato">
        <p>
          Dúvidas, pedidos ou reclamações sobre privacidade: <Email endereco={CONTATO.privacidade} />. Respondemos no prazo previsto na LGPD. Você também pode
          procurar a Autoridade Nacional de Proteção de Dados (ANPD).
        </p>
        <p className="text-[14px] text-fg-subtle">
          Podemos atualizar esta política; a data no topo indica a versão em vigor. Mudanças relevantes serão destacadas nesta página.
        </p>
      </Secao>
    </PaginaInstitucional>
  );
}
