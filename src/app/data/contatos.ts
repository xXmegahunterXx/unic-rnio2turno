/**
 * Contatos públicos do site (painel → Comunicação → Contatos públicos), lidos do status: e-mails só quando configurados
 * (nunca um endereço provisório); o contato geral cai no e-mail da /anuncie. Ver src/shared/contatos.ts.
 */
import { contatosEfetivos, type ContatosEfetivos } from '@/shared/contatos';
import { useStatus } from './hooks';

export function useContatos(): ContatosEfetivos & { carregado: boolean } {
  const st = useStatus().data;
  return { ...contatosEfetivos(st?.contatos, st?.anuncie), carregado: !!st };
}
