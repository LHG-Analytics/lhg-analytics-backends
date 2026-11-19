import { Mensagem, emailComBotao } from './email.service';

/** E-mail do "esqueci a senha" (o link vale 30 min e uma vez só). */
export function emailDeRedefinicao(c: {
  para: string;
  nome: string | null;
  /** {issuer}/senha/nova#token. Só vai no e-mail, nunca no log. */
  link: string;
  minutos: number;
}): Mensagem {
  const { html, texto } = emailComBotao({
    titulo: 'Redefinir a sua senha do HUB LHG',
    paragrafos: [
      c.nome?.trim() ? `Olá, ${c.nome.trim()}.` : 'Olá.',
      'Recebemos um pedido para redefinir a senha da sua conta no HUB LHG.',
      `O link vale por ${c.minutos} minutos e pode ser usado uma vez só. Ao trocar a senha, você sai de todos os aparelhos.`,
    ],
    botao: { texto: 'Criar uma nova senha', url: c.link },
    rodape:
      'Se não foi você que pediu, ignore este e-mail: a sua senha continua a mesma. Este endereço não recebe respostas.',
  });
  return {
    para: c.para,
    assunto: 'Redefinir a sua senha do HUB LHG',
    html,
    texto,
  };
}
