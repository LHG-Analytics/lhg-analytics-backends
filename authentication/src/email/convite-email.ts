import { Mensagem } from './email.service';
import { emailDoHub } from './moldura';

export interface DadosEmailConvite {
  para: string;
  /** Nome da pessoa convidada, se informado no convite. */
  nome: string | null;
  /** Nome de quem convidou (o admin), se houver. */
  convidadoPor: string | null;
  /** Nomes dos sistemas liberados (já traduzidos das chaves). */
  sistemas: string[];
  expiraEm: Date | null;
  /** O link do convite (base#token). Só vai no e-mail, nunca no log. */
  link: string;
}

/** Data em São Paulo, dd/mm/aaaa. */
export function dataBr(d: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

/** E-mail do convite do HUB LHG (o conteúdo combinado com o HUB). */
export function emailDoConvite(c: DadosEmailConvite): Mensagem {
  const quem = c.convidadoPor?.trim();
  const { html, texto } = emailDoHub({
    previa: quem
      ? `${quem} convidou você para o HUB LHG.`
      : 'Você foi convidado(a) para o HUB LHG.',
    titulo: 'Seu convite para o HUB LHG',
    paragrafos: [
      c.nome?.trim() ? `Olá, ${c.nome.trim()}.` : 'Olá.',
      quem
        ? `${quem} convidou você para acessar o HUB LHG, o portal dos sistemas da LHG.`
        : 'Você foi convidado(a) para acessar o HUB LHG, o portal dos sistemas da LHG.',
      'Para aceitar, defina uma senha ou entre com a sua conta Google.',
    ],
    detalhes: [
      [
        'Acesso liberado',
        c.sistemas.length
          ? c.sistemas.join(', ')
          : 'Nenhum sistema por enquanto',
      ],
      [
        'Convite válido até',
        c.expiraEm ? dataBr(c.expiraEm) : 'Sem prazo de validade',
      ],
    ],
    botao: { texto: 'Aceitar o convite', url: c.link },
    motivo:
      'Você recebeu este e-mail porque um administrador da LHG convidou você. Se não esperava este convite, ignore este e-mail.',
  });
  return { para: c.para, assunto: 'Seu convite para o HUB LHG', html, texto };
}
