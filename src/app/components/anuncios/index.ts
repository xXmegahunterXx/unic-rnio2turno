/**
 * Anúncios no site (anunciantes NÃO políticos — ARCHITECTURE §1.5 e §10.2, item 10). Formatos:
 *  - FaixaTopo (AppShell) · BarraRodape (AppShell, celular) · AnuncioNativo (entre seções das páginas)
 *  - OferecimentoTeste (resultado do Teste Cego) · OferecimentoTv (Modo TV)
 * As peças `*Peca` desenham um anúncio dado (prévia do admin e galeria da /anuncie, com `previa`).
 * Logo (anunciantes v2): `LogoMarca` (proporção natural e placa por tema, `logo.ts`), `TemaLocal`/`useTemaLogo` (prévias
 * claro | escuro: junto com `data-tema-local` no elemento), `apresentacaoLogo`, `ehLogotipo` e `placaDaPeca` (puros).
 *
 * JS inicial: o AppShell e as páginas importam DIRETO dos módulos (`anuncios/FaixaTopo`, `anuncios/AnuncioNativo`,
 * `anuncios/contexto`…), nunca deste índice — reexportar daqui puxa todas as peças para o chunk de quem importa.
 */
export { ProvedorAnuncios, useAnunciosDaPagina } from './contexto';
export { FaixaTopo, ALTURA_TOPO } from './FaixaTopo';
export { FaixaTopoPeca } from './FaixaTopoPeca';
export { BarraRodape, BarraRodapePeca, ALTURA_RODAPE_PX } from './BarraRodape';
export { AnuncioNativo } from './AnuncioNativo';
export { AnuncioNativoPeca, AnuncioDaCasa, type VarianteNativo } from './AnuncioNativoPeca';
export { OferecimentoTeste, OferecimentoTestePeca, OferecimentoTv, OferecimentoTvPeca } from './Oferecimento';
export { LogoMarca, RotuloAnuncio, CtaAnuncio, TemaLocal, useTemaLogo, type TamanhoLogo } from './pecas';
export { apresentacaoLogo, ehLogotipo, placaDaPeca, type ApresentacaoLogo, type LogoDoAnuncio, type TemaLogo } from './logo';
export { CASA, rodapePermitido, escolhaDaPagina, hrefDoAnuncio, imagemDoAnuncio, linkEmail, linkWhatsApp, fmtWhatsApp, temContato } from './nucleo';
export { VitrineFormato } from './Vitrine';
