/**
 * Capitalização de exibição dos nomes do feed do TSE (CAIXA ALTA → nome de exibição), com casos reais de 2026.
 *   npx vitest run scripts/data/nomes.test.ts
 */
import { describe, expect, it } from 'vitest';
import { nomeSimples } from './py/candidatos_comum';
import { nomeColigacao, nomePessoa } from './lib/nomes';

describe('nomeSimples (nomes de urna e completos dos candidatos não finalistas)', () => {
  const casos: [string, string][] = [
    // siglas com vogal (lista explícita) e só de consoantes
    ['ACM NETO', 'ACM Neto'],
    ['ELZILENE DA CUT', 'Elzilene da CUT'],
    ['AGNALDO DO SAMU', 'Agnaldo do SAMU'],
    ['ROGÉRIA DA ONG', 'Rogéria da ONG'],
    ['CRISTINA ACS', 'Cristina ACS'],
    ['STEFANIA DO PCO', 'Stefania do PCO'],
    ['MARI MAZZON SOS 4 PATAS', 'Mari Mazzon SOS 4 Patas'],
    ['JHC', 'JHC'],
    ['ANA LUIZA DO MLB', 'Ana Luiza do MLB'],
    ['CHIQUINHO DO PT', 'Chiquinho do PT'],
    ['MC DHAMA', 'MC Dhama'],
    ['PAULO CÉSAR (PC)', 'Paulo César (PC)'],
    ['AGRIPINO BANCADA LGBT+', 'Agripino Bancada LGBT+'],
    ['DANIEL TRZECIAK "DANIEL DA TV"', 'Daniel Trzeciak "Daniel da TV"'],
    // "TI" só depois de da/do
    ['KLEBER DA TI', 'Kleber da TI'],
    ['TI MIGUÉ DA BARBEARIA', 'Ti Migué da Barbearia'],
    // Y conta como vogal
    ['JEAN WYLLYS', 'Jean Wyllys'],
    ['CRYS FRAGA', 'Crys Fraga'],
    ['FAGNER SKY', 'Fagner Sky'],
    // abreviações com inicial maiúscula (não são siglas)
    ['DR. ACILON', 'Dr. Acilon'],
    ['DRA. ADRIANA', 'Dra. Adriana'],
    ['PR. ABEL PEDRAÇA', 'Pr. Abel Pedraça'],
    ['SGT. ANA CLAUDIA', 'Sgt. Ana Claudia'],
    ['ADAIL JR.', 'Adail Jr.'],
    ['PROFª ALTACI KOKAMA', 'Profª Altaci Kokama'],
    ['DELEGADA ADRIANA ACCORSI', 'Delegada Adriana Accorsi'],
    ['CMDT. ANDRADE', 'Cmdt. Andrade'],
    // algarismo romano e UF no fim
    ['RAUL RIBEIRO BATISTA II', 'Raul Ribeiro Batista II'],
    ['MÚSICO VINYCIUS VI', 'Músico Vinycius VI'],
    ['JUNIOR DO HABITAT PE', 'Junior do Habitat PE'],
    ['MESTRE DRAGÃO RO', 'Mestre Dragão RO'],
    ['ANA VI SANTOS', 'Ana Vi Santos'],
    // pontuação
    ['EMANUEL S.O.S', 'Emanuel S.O.S'],
    ['DR.ALLAN NEGREIROS', 'Dr.Allan Negreiros'],
    ['DR. WAGNER MIRANDA HOSP.CANCER', 'Dr. Wagner Miranda Hosp.Cancer'],
    ['AMARILDO PAULINO (LEVINO)', 'Amarildo Paulino (Levino)'],
    ['EDWARD (O DOUTOR DA ALEGRIA)', 'Edward (O Doutor da Alegria)'],
    ['SERGINHO (DO POSTO)', 'Serginho (do Posto)'],
    ['LULU DAS COMUNIDADES/PABLO', 'Lulu das Comunidades/Pablo'],
    ['DÁRIO 4E20', 'Dário 4E20'],
    ['MARCINHA F-250', 'Marcinha F-250'],
    ['AGOPIN.COM', 'Agopin.com'],
    // apóstrofos (inclusive os tipográficos)
    ["JOANA D'ARC", "Joana d'Arc"],
    ["D'JANE SILVA", "D'Jane Silva"],
    ["CARLOS SANT'ANNA", "Carlos Sant'Anna"],
    ['KAKÁ D´ÁVILA', 'Kaká d´Ávila'],
    ['RODRIGO SANT`ANA', 'Rodrigo Sant`Ana'],
    ["IARA ROSANA HAUSMANN O'LOUGHLIN", "Iara Rosana Hausmann O'Loughlin"],
    // nomes comuns não mudam de regra
    ['MARIA DO SOCORRO DOS SANTOS', 'Maria do Socorro dos Santos'],
    ['HO-CHE-MIN SILVA DE VIEIRA', 'Ho-Che-Min Silva de Vieira'],
    ['ANDRE DEL RÉ NAAMAN', 'Andre Del Ré Naaman'],
  ];
  it.each(casos)('%s → %s', (bruto, esperado) => {
    expect(nomeSimples(bruto)).toBe(esperado);
  });

  it('preserva letras, acentos e pontuação do TSE (só muda a caixa)', () => {
    for (const [bruto] of casos) {
      expect(nomeSimples(bruto).toLocaleUpperCase('pt-BR')).toBe(bruto.trim().replace(/\s+/g, ' ').toLocaleUpperCase('pt-BR'));
    }
  });
});

describe('nomeColigacao e nomePessoa', () => {
  it('coligações: romano no fim, siglas de UF e "não para"', () => {
    expect(nomeColigacao('ALAGOAS GIGANTE II')).toBe('Alagoas Gigante II');
    expect(nomeColigacao('POR UM MS DO POVO')).toBe('Por um MS do Povo');
    expect(nomeColigacao('NOSSO RIO GRANDE NÃO PARA')).toBe('Nosso Rio Grande Não Para');
    expect(nomeColigacao('PARANÁ PARA TODOS')).toBe('Paraná para Todos');
    expect(nomeColigacao("ESPERANÇA E TRABALHO'")).toBe('Esperança e Trabalho');
  });

  it('finalistas (nomePessoa) mantêm a grafia de meta.json', () => {
    expect(nomePessoa('FLAVIO BOLSONARO')).toBe('Flávio Bolsonaro');
    expect(nomePessoa('CADU DE LULA')).toBe('Cadu de Lula');
    expect(nomePessoa('PROFESSORA MARIA DO CARMO')).toBe('Professora Maria do Carmo');
  });
});
