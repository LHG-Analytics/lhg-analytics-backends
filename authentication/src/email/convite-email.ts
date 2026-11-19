import { Mensagem, emailComBotao } from './email.service';

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
  const sistemas = c.sistemas.length ? c.sistemas.join(', ') : null;
  const paragrafos = [
    c.nome?.trim() ? `Olá, ${c.nome.trim()}.` : 'Olá.',
    quem
      ? `${quem} convidou você para acessar o HUB LHG, o portal dos sistemas da LHG.`
      : 'Você foi convidado(a) para acessar o HUB LHG, o portal dos sistemas da LHG.',
    ...(sistemas ? [`Acesso liberado: ${sistemas}.`] : []),
    c.expiraEm
      ? `O convite vale até ${dataBr(c.expiraEm)}.`
      : 'O convite não tem prazo de validade.',
    'Para aceitar, defina uma senha ou entre com a sua conta Google.',
  ];
  const { html, texto } = emailComBotao({
    titulo: 'Seu convite para o HUB LHG',
    paragrafos,
    botao: { texto: 'Aceitar o convite', url: c.link },
    rodape:
      'Se você não esperava este convite, ignore este e-mail. Este endereço não recebe respostas.',
  });
  return { para: c.para, assunto: 'Seu convite para o HUB LHG', html, texto };
}
