/**
 * /privacidade — LGPD em linguagem simples: não coletamos as respostas do Teste Cego (opinião política é dado
 * sensível), o que fica no navegador (com botão para apagar), sem cookies de rastreamento, anúncios (contagem
 * agregada de impressões e cliques, sem cookie, IP ou dado pessoal; UTMs nos links patrocinados), medição de audiência
 * própria e agregada (src/server/audiencia.ts), o formulário "Quero anunciar" (src/server/leads.ts), o chat ao vivo,
 * dados técnicos, quem é o responsável (controlador, encarregado e operadores), direitos e contato. Os e-mails e o
 * responsável vêm do painel (Comunicação → Contatos públicos); sem configuração, nenhum e-mail aparece.
 */
import { useState } from 'react';
import { formatarCnpj } from '@/shared/contatos';
import { useContatos } from '@/app/data/contatos';
import { Button } from '@/app/ui/Button';
import { toast } from '@/app/ui/Toast';
import {
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
  { id: 'palpite', titulo: 'Palpite do 2º turno' },
  { id: 'navegador', titulo: 'O que fica no seu navegador' },
  { id: 'links', titulo: 'Links de resultado e Duelo' },
  { id: 'cookies', titulo: 'Cookies e analytics' },
  { id: 'audiencia', titulo: 'Medição de audiência' },
  { id: 'anuncios', titulo: 'Anúncios' },
  { id: 'anunciar', titulo: 'Formulário “Quero anunciar”' },
  { id: 'chat', titulo: 'Chat ao vivo' },
  { id: 'tecnicos', titulo: 'Dados técnicos' },
  { id: 'responsavel', titulo: 'Quem trata os dados' },
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
  const c = useContatos();
  // canal para pedidos sobre dados: o e-mail de privacidade; sem ele, o contato geral (nunca um endereço provisório)
  const canal = c.privacidade ?? c.geral;
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
      atualizado="15 de outubro de 2026"
      sumario={SUMARIO}
      destaque={
        <Resumo
          itens={[
            { icone: 'olho-fechado', titulo: 'Não coletamos suas respostas', texto: 'O Teste Cego roda inteiro no seu navegador. Nada é enviado, registrado ou somado.' },
            { icone: 'selo', titulo: 'Sem cookies de rastreamento', texto: 'Sem pixels de redes sociais, sem publicidade direcionada e sem analytics que identifiquem você.' },
            { icone: 'usuarios', titulo: 'Sem cadastro', texto: 'Para usar o site, não pedimos nome, e-mail, telefone nem login. Só quem quer anunciar preenche um formulário, se quiser.' },
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
            <>As afirmações, o sorteio da ordem, as suas respostas e o cálculo da sintonia ficam no seu navegador.</>,
            <>Não há envio das respostas a servidor, nem registro, nem ferramenta de analytics com as escolhas.</>,
            <>
              Não fazemos enquetes: como não recebemos respostas, não temos como somá-las, e nunca mostramos preferência de usuários.
            </>,
          ]}
        />
      </Secao>

      <Secao id="palpite" titulo="Palpite do 2º turno">
        <p>
          O palpite (o percentual que você crava para cada candidato) também <strong>nunca chega ao Sintonia</strong>: ele fica guardado só no
          seu aparelho e a comparação com o resultado oficial é feita no seu navegador.
        </p>
        <Lista
          itens={[
            <>Não recebemos, não registramos e não somamos palpites. Não existe “palpite da maioria”: isso seria uma enquete.</>,
            <>
              Se você compartilhar, o palpite vai <strong>no próprio link</strong>, depois do “#” (essa parte do endereço não é enviada a servidor
              nenhum), e na imagem gerada no seu aparelho. Quem receber o link vê o seu palpite.
            </>,
            <>Para apagar, use “Apagar meus dados”, abaixo.</>,
          ]}
        />
      </Secao>

      <Secao id="navegador" titulo="O que fica no seu navegador">
        <p>
          Algumas preferências ficam guardadas <strong>só no seu aparelho</strong>, no armazenamento local do navegador, para o site lembrar de
          você sem precisar de conta. Nada disso é enviado para nós, exceto o código do chat ao vivo quando você usa a sala (veja “Chat ao
          vivo”, abaixo).
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
            ['Buscas recentes (o estado, a cidade ou a seção que você procurou)', 'Armazenamento local', 'Até você apagar'],
            ['Seu cenário da calculadora “E se…?”', 'Armazenamento local', 'Até você apagar'],
            ['Marca de que o resultado de um Teste Cego já foi revelado nesta aba', 'Armazenamento da aba (sessionStorage)', 'Some ao fechar a aba'],
            ['Horário da última recarga automática depois de uma atualização do site', 'Armazenamento da aba (sessionStorage)', 'Some ao fechar a aba'],
            ['Seu palpite do 2º turno (o percentual e a hora em que você cravou)', 'Armazenamento local', 'Até você apagar'],
            ['Número aleatório que alterna os anúncios entre as visitas (não identifica você e nunca é enviado)', 'Armazenamento da aba (sessionStorage)', 'Some ao fechar a aba'],
            ['Se você fechou a barra de anúncio do celular', 'Armazenamento da aba (sessionStorage)', 'Some ao fechar a aba'],
            ['Apelido que você escolheu no chat ao vivo', 'Armazenamento local', 'Até você apagar'],
            ['Código aleatório do chat ao vivo (vai junto com as suas mensagens, denúncias, reações e o sinal de presença, só para os limites contra abuso)', 'Armazenamento local', 'Até você apagar'],
            ['Se o painel do chat ficou aberto no computador', 'Armazenamento local', 'Até você apagar'],
            ['Marca de que a entrada desta aba já foi contada na medição de audiência (só “sim”, sem código nenhum)', 'Armazenamento da aba (sessionStorage)', 'Some ao fechar a aba'],
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
          sessão do painel administrativo, usado só pela equipe. Não há pixels de anunciantes nem scripts de terceiros nas páginas.
        </p>
        <p>
          Também não usamos Google Analytics nem outra ferramenta de terceiros: a audiência é medida pelo próprio Sintonia, só em totais (veja
          abaixo).
        </p>
      </Secao>

      <Secao id="audiencia" titulo="Medição de audiência">
        <p>
          Para saber quantas pessoas usam o site (e mostrar isso a anunciantes), o Sintonia conta a própria audiência, <strong>só em totais</strong>,
          sem identificar ninguém.
        </p>
        <Lista
          itens={[
            <>
              <strong>O que o seu navegador envia.</strong> A cada página, só o tipo de página (por exemplo, “Apuração” ou “Teste Cego”), sem o
              endereço completo, sem os parâmetros e sem o código de um Duelo. Na primeira página da aba, de onde você veio, resumido (“X”,
              “Google” ou o domínio de um site), nunca o endereço da página de origem. Enquanto a aba está aberta e visível, um sinal de presença a
              cada 1 a 4 minutos.
            </>,
            <>
              <strong>O que guardamos.</strong> Só totais: páginas vistas por dia, por tipo de página e por hora; entradas por origem; visitantes
              únicos estimados por dia; e o maior número de pessoas no site ao mesmo tempo, com data e hora.
            </>,
            <>
              <strong>Visitantes únicos sem identificar ninguém.</strong> Para não contar a mesma pessoa duas vezes no dia, o servidor calcula, só em
              memória, um código a partir da conexão e do tipo de navegador, misturado a um valor aleatório que muda todo dia e nunca é gravado. À
              meia-noite o valor e a lista do dia são descartados e fica só o número. Não guardamos IP, cookie nem identificador.
            </>,
            <>
              <strong>Nada sobre a sua opinião.</strong> O sinal não diz nada sobre as suas respostas do Teste Cego nem sobre candidatos.
            </>,
            <>
              <strong>“Não rastrear” respeitado.</strong> Com o Global Privacy Control ou o Do Not Track ligados no navegador, o sinal não é enviado.
            </>,
          ]}
        />
        <p>
          Esses totais podem aparecer na página <LinkInterno to="/anuncie">Anuncie no Sintonia</LinkInterno>, sempre com a data de início da
          medição.
        </p>
      </Secao>

      <Secao id="anuncios" titulo="Anúncios">
        <p>
          O Sintonia tem espaços de anúncio para <strong>anunciantes não políticos</strong>, sempre identificados como publicidade. Os anúncios
          não são direcionados: não sabemos quem você é, e todo mundo vê a mesma rotação de anunciantes.
        </p>
        <Lista
          itens={[
            <>
              <strong>Contagem agregada.</strong> Para o relatório dos anunciantes, contamos só totais: quantas vezes cada anúncio apareceu na
              tela (pelo menos metade dele, por pelo menos 1 segundo) e quantas vezes foi tocado, por formato e por hora. O aviso enviado pelo seu
              navegador leva apenas o código do anúncio e o formato.
            </>,
            <>
              <strong>Sem cookie e sem guardar IP.</strong> Nenhum cookie é criado e a contagem não guarda o endereço IP: o servidor
              usa, só em memória e por no máximo uma hora, um código anônimo derivado da conexão para não contar a mesma visualização ou o mesmo
              clique duas vezes. Esse código nunca é gravado nem associado a você.
            </>,
            <>
              <strong>Links patrocinados com UTM.</strong> Ao tocar num anúncio, o link passa pelo Sintonia (para somar o clique) e abre o site
              do anunciante em nova aba com marcadores de campanha no endereço: <span className="font-mono text-[14px] text-fg">utm_source=sintonia</span>,
              o formato em <span className="font-mono text-[14px] text-fg">utm_medium</span> e o anúncio em{' '}
              <span className="font-mono text-[14px] text-fg">utm_campaign</span>. Eles dizem ao anunciante só que a visita veio do Sintonia e
              de qual formato; nada sobre você. O anúncio da tela do Teste Cego sai com{' '}
              <span className="font-mono text-[14px] text-fg">utm_medium=conteudo</span>, para não contar ao anunciante que a visita fez o
              teste. A partir dali vale a política de privacidade do site do anunciante.
            </>,
            <>Os anúncios nunca têm acesso às suas respostas do Teste Cego, que não saem do seu aparelho.</>,
          ]}
        />
        <p>
          Quer anunciar? Veja os formatos e as regras em <LinkInterno to="/anuncie">Anuncie no Sintonia</LinkInterno>.
        </p>
      </Secao>

      <Secao id="anunciar" titulo="Formulário “Quero anunciar”">
        <p>
          Quem quer anunciar pode preencher o formulário da página <LinkInterno to="/anuncie#contato">Anuncie</LinkInterno>: nome, empresa, e-mail de
          trabalho, WhatsApp (opcional), formatos de interesse e uma mensagem. Ninguém precisa preencher nada para usar o site.
        </p>
        <Lista
          itens={[
            <>
              <strong>Só para responder.</strong> Os dados são usados apenas para responder ao seu contato comercial, com o seu consentimento
              (LGPD, art. 7º, I), marcado no próprio formulário. Não entram em lista de e-mails e não são repassados a ninguém.
            </>,
            <>
              <strong>Onde ficam e por quanto tempo.</strong> No servidor do Sintonia, sem o seu IP, com acesso só da equipe pelo painel. Depois de
              respondido, o pedido é apagado em até 180 dias; sem resposta, em até 1 ano; ou antes, se você pedir. As cópias de segurança do
              servidor são substituídas a cada hora e guardam o pedido por até 3 dias depois de apagado; cópias guardadas fora do servidor ficam
              cifradas e são apagadas em até 30 dias.
            </>,
            canal ? (
              <>
                <strong>Você pode mudar de ideia.</strong> Para corrigir ou apagar os dados, ou retirar o consentimento, escreva para{' '}
                <Email endereco={canal} />.
              </>
            ) : (
              <>
                <strong>Você pode mudar de ideia.</strong> Para corrigir ou apagar os dados, ou retirar o consentimento, use o canal de
                privacidade publicado na seção “Contato”, abaixo.
              </>
            ),
          ]}
        />
      </Secao>

      <Secao id="chat" titulo="Chat ao vivo">
        <p>
          Na noite da apuração, a <LinkInterno to="/ao-vivo">Sala da apuração</LinkInterno> é um chat público e moderado. O que você escreve
          ali fica <strong>visível para todo mundo</strong>: não publique dados pessoais nem nada que não queira tornar público.
        </p>
        <Lista
          itens={[
            <>
              <strong>O que recebemos.</strong> O apelido, o texto da mensagem e um código aleatório gerado pelo seu navegador (não tem seu nome,
              e-mail ou telefone). Denúncias, reações e o sinal de “estou na sala” levam só esse código.
            </>,
            <>
              <strong>Por quanto tempo.</strong> As mensagens ficam só na memória do servidor, nunca em disco: no máximo as 300 mais recentes e por
              até 12 horas, e somem antes se a moderação apagar ou se o servidor reiniciar.
            </>,
            <>
              <strong>Sem IP.</strong> Para limitar abusos (modo lento, limite por hora, denúncias de pessoas diferentes), o servidor usa, só em
              memória, um código anônimo derivado da conexão e do código do navegador. O endereço IP não é guardado e o texto das mensagens não vai
              para os registros técnicos.
            </>,
            <>
              <strong>Sem enquete.</strong> As reações (🔥 😮 👏 👀) são contadas só no total do último minuto, sem relação com candidato (o site mostra
              só esse total, nunca por emoji), e nenhuma mensagem é somada como preferência.
            </>,
            <>
              <strong>Se a lei exigir identificar quem escreveu.</strong> Por padrão nada disso é guardado. Se for preciso cumprir a obrigação legal de
              guardar registros de acesso (Marco Civil da Internet, art. 15; LGPD, art. 7º, II), o Sintonia passa a guardar, de cada mensagem
              publicada, o código da mensagem, a data e a hora, o endereço IP e a porta de origem, o apelido e o texto publicados — cifrados com
              uma chave que fica fora do servidor, por 6 meses, abertos apenas por ordem judicial. Quando isso estiver ligado, as regras da própria
              sala avisam.
            </>,
          ]}
        />
      </Secao>

      <Secao id="tecnicos" titulo="Dados técnicos">
        <p>
          Como em qualquer site, cada acesso chega com dados técnicos: endereço IP, data e hora, página pedida e tipo de navegador. O Sintonia usa
          esses dados só no momento, para entregar a página, medir a carga em totais e proteger contra abuso, e{' '}
          <strong>não grava o endereço IP</strong> de quem acessa (os registros técnicos do servidor não têm IP). A rede de distribuição do
          site (Cloudflare) e o provedor da hospedagem também recebem esses dados para entregar o site e os tratam conforme as políticas
          deles.
        </p>
        <Destaque icone="olho-fechado" tom="marca">
          Esses dados nunca contêm respostas do Teste Cego: elas não passam pelos nossos servidores.
        </Destaque>
      </Secao>

      <Secao id="responsavel" titulo="Quem trata os dados">
        <Lista
          itens={[
            c.responsavel ? (
              <>
                <strong>Responsável (controlador).</strong> {c.responsavel}
                {c.cnpj ? (
                  <>
                    , CNPJ <span className="num">{formatarCnpj(c.cnpj)}</span>
                  </>
                ) : null}
                , que decide como os dados descritos nesta página são tratados.
              </>
            ) : (
              <>
                <strong>Responsável (controlador).</strong> A equipe do Sintonia, que decide como os dados descritos nesta página são tratados. A
                identificação completa será publicada aqui.
              </>
            ),
            canal ? (
              <>
                <strong>Canal do encarregado de dados.</strong> Pedidos e dúvidas sobre dados pessoais: <Email endereco={canal} />.
              </>
            ) : (
              <>
                <strong>Canal do encarregado de dados.</strong> O endereço para pedidos sobre dados pessoais será publicado na seção “Contato”.
              </>
            ),
            <>
              <strong>Quem ajuda a operar o site.</strong> A Cloudflare (rede de distribuição e proteção do site) e o provedor do servidor onde o
              Sintonia roda. Eles recebem os dados técnicos de cada acesso para entregar o site, e o servidor guarda o que esta página descreve
              (pedidos de anunciantes e totais de audiência).
            </>,
          ]}
        />
      </Secao>

      <Secao id="direitos" titulo="Seus direitos">
        <p>
          A LGPD garante a você, entre outros, o direito de saber quais dados tratamos, de corrigi-los e de pedir que sejam apagados (art. 18).
          Como não guardamos dados pessoais seus (só, se você preencheu o formulário “Quero anunciar”, o que enviou nele, e as mensagens do chat
          ao vivo, por até 12 horas), quase tudo se resolve no seu próprio aparelho: use o botão “Apagar meus dados” acima ou limpe os dados do
          site no navegador.
        </p>
        <p>
          Veja também a <LinkInterno to="/metodologia">metodologia</LinkInterno> e a página <LinkInterno to="/sobre">sobre o Sintonia</LinkInterno>.
        </p>
      </Secao>

      <Secao id="contato" titulo="Contato">
        {canal ? (
          <p>
            Dúvidas, pedidos ou reclamações sobre privacidade: <Email endereco={canal} />. Respondemos no prazo previsto na LGPD. Você também pode
            procurar a Autoridade Nacional de Proteção de Dados (ANPD).
          </p>
        ) : (
          <p>
            O endereço para dúvidas, pedidos e reclamações sobre privacidade será publicado aqui em breve. Você também pode procurar a Autoridade
            Nacional de Proteção de Dados (ANPD).
          </p>
        )}
        <p className="text-[14px] text-fg-subtle">
          Podemos atualizar esta política; a data no topo indica a versão em vigor. Mudanças relevantes serão destacadas nesta página.
        </p>
      </Secao>
    </PaginaInstitucional>
  );
}
