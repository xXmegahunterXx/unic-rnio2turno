/**
 * Onde o chat ao vivo flutuante (ChatFlutuante: popup no computador, alça/folha no celular) aparece: em todas as páginas
 * do AppShell, menos
 *  - /ao-vivo: já é a sala inteira (seriam duas salas na tela);
 *  - o Teste Cego (/teste, /teste/resultado) e o Duelo (/duelo/…): o teste é "ideias antes de nomes" — mensagens com
 *    nome de candidato ao lado das afirmações estragariam o teste às cegas, e no resultado/duelo a sala viraria um mural
 *    de "deu X% com fulano" (contagem informal de preferência, ARCHITECTURE §1.2); no celular as respostas e o "Revelar"
 *    ficam na metade de baixo da tela (o mesmo motivo de a barra de anúncio não aparecer ali, `rodapePermitido`).
 * /admin, /tv, /live, /embed/* e /relatorio ficam fora do AppShell: lá o chat nunca é montado.
 *
 * Sem dependências: entra no JS inicial (o AppShell decide se carrega o chunk do chat).
 */
export const chatNaRota = (pathname: string): boolean => !/^\/(ao-vivo|teste|duelo)(\/|$)/.test(pathname);
