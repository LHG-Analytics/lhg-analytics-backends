import { Mensagem } from './email.service';
import { emailDoHub } from './moldura';

/** E-mail do "esqueci a senha" (o link vale 30 min e uma vez só). */
export function emailDeRedefinicao(c: {
  para: string;
  nome: string | null;
  /** {issuer}/senha/nova#token. Só vai no e-mail, nunca no log. */
  link: string;
  minutos: number;
}): Mensagem {
  const { html, texto } = emailDoHub({
    previa: `Crie uma nova senha. O link vale ${c.minutos} minutos.`,
    titulo: 'Redefinir a sua senha do HUB LHG',
    paragrafos: [
      c.nome?.trim() ? `Olá, ${c.nome.trim()}.` : 'Olá.',
      'Recebemos um pedido para redefinir a senha da sua conta no HUB LHG.',
      `O link vale por ${c.minutos} minutos e pode ser usado uma vez só. Ao trocar a senha, você sai de todos os aparelhos.`,
    ],
    botao: { texto: 'Criar uma nova senha', url: c.link },
    motivo:
      'Você recebeu este e-mail porque alguém pediu uma senha nova para este e-mail. Se não foi você, ignore: a sua senha continua a mesma.',
  });
  return {
    para: c.para,
    assunto: 'Redefinir a sua senha do HUB LHG',
    html,
    texto,
  };
}
