// E-mail pelo Resend: sem chave não envia; 2xx = enviado; erro, timeout ou
// não 2xx = FALHA_ENVIO, sem lançar e sem nada pessoal no log. Chave de TESTE.
import { Logger } from '@nestjs/common';
import { emailDoConvite } from './convite-email';
import {
  EMAIL_TIMEOUT_MS,
  EmailService,
  REMETENTE,
  RESEND_URL,
  escaparHtml,
} from './email.service';
import { LOGO_PADRAO, SUPORTE_EMAIL, SUPORTE_URL } from './moldura';
import { emailDeRedefinicao } from './senha-email';

const CHAVE = 're_teste_' + 'x'.repeat(24);
const MSG = {
  para: 'pessoa@example.invalid',
  assunto: 'Assunto',
  html: '<p>oi</p>',
  texto: 'oi',
};

describe('EmailService', () => {
  let avisos: jest.SpyInstance;
  beforeEach(() => {
    avisos = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });
  afterEach(() => avisos.mockRestore());

  it('sem RESEND_API_KEY (ou vazia): NAO_CONFIGURADO, sem chamar a rede', async () => {
    for (const valor of [undefined, '', '   ']) {
      const http = jest.fn();
      const s = new EmailService(() => valor, http as any);
      expect(s.configurado).toBe(false);
      expect(await s.enviar(MSG)).toEqual({
        enviado: false,
        erro: 'NAO_CONFIGURADO',
      });
      expect(http).not.toHaveBeenCalled();
    }
  });

  it('envia ao Resend com o remetente fixo, a chave no Bearer e timeout de 5 s', async () => {
    const http = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    const s = new EmailService(
      (n) => (n === 'RESEND_API_KEY' ? CHAVE : undefined),
      http as any,
    );
    expect(s.configurado).toBe(true);
    expect(await s.enviar(MSG)).toEqual({ enviado: true });
    const [url, init] = http.mock.calls[0];
    expect(url).toBe(RESEND_URL);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe(`Bearer ${CHAVE}`);
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(EMAIL_TIMEOUT_MS).toBe(5000);
    expect(JSON.parse(init.body)).toEqual({
      from: REMETENTE,
      to: [MSG.para],
      subject: MSG.assunto,
      html: MSG.html,
      text: MSG.texto,
    });
    expect(REMETENTE).toBe('HUB LHG <nao-responda@lhgmoteis.com.br>');
  });

  it('resposta não 2xx, erro de rede ou timeout: FALHA_ENVIO, sem lançar; o log não tem destinatário, conteúdo nem chave', async () => {
    const casos = [
      jest.fn().mockResolvedValue({ ok: false, status: 422 }),
      jest.fn().mockRejectedValue(new TypeError('fetch failed')),
      jest
        .fn()
        .mockRejectedValue(
          Object.assign(new Error('timeout'), { name: 'TimeoutError' }),
        ),
    ];
    for (const http of casos) {
      const s = new EmailService(() => CHAVE, http as any);
      expect(await s.enviar(MSG)).toEqual({
        enviado: false,
        erro: 'FALHA_ENVIO',
      });
    }
    const log = avisos.mock.calls.flat().join('\n');
    expect(log).toMatch(/HTTP 422/);
    expect(log).toMatch(/TimeoutError/);
    for (const s of [MSG.para, MSG.assunto, CHAVE, 'oi'])
      expect(log).not.toContain(s);
  });
});

describe('e-mail do convite', () => {
  const LINK =
    'https://hub.exemplo.invalid/auth/oidc/convite#' + 'T'.repeat(43);
  const base = {
    para: 'convidado@example.invalid',
    nome: 'Pessoa <b>Teste</b>',
    convidadoPor: 'Admin Teste',
    sistemas: ['CMS', 'Help Desk'],
    expiraEm: new Date('2026-11-26T12:00:00Z'),
    link: LINK,
  };

  it('nome, quem convidou, sistemas, validade, botão com o link e o aviso de ignorar', () => {
    const m = emailDoConvite(base);
    expect(m.para).toBe(base.para);
    expect(m.assunto).toBe('Seu convite para o HUB LHG');
    for (const t of [m.html, m.texto]) {
      expect(t).toContain('Admin Teste convidou você');
      expect(t).toContain('Acesso liberado');
      expect(t).toContain('CMS, Help Desk');
      expect(t).toContain('Convite válido até');
      expect(t).toContain('26/11/2026');
      expect(t).toContain(LINK);
      expect(t).toContain('Se não esperava este convite, ignore este e-mail.');
    }
    expect(m.texto).toContain('Acesso liberado: CMS, Help Desk');
    expect(m.texto).toContain('Convite válido até: 26/11/2026');
    expect(m.html).toContain(`href="${LINK}"`);
    // o nome vem do admin: escapado no HTML
    expect(m.html).toContain('Olá, Pessoa &lt;b&gt;Teste&lt;/b&gt;.');
    expect(m.html).not.toContain('<b>Teste</b>');
  });

  it('sem nome, sem quem convidou, sem sistemas e sem validade', () => {
    const m = emailDoConvite({
      ...base,
      nome: null,
      convidadoPor: null,
      sistemas: [],
      expiraEm: null,
    });
    expect(m.texto).toContain('Olá.');
    expect(m.texto).toContain('Você foi convidado(a) para acessar o HUB LHG');
    expect(m.texto).toContain('Acesso liberado: Nenhum sistema por enquanto');
    expect(m.texto).toContain('Convite válido até: Sem prazo de validade');
  });

  it('moldura do HUB: tabelas e CSS inline (600 px), faixa roxa com o logo BRANCO e o selo HUB em HTML, botão sólido com VML para o Outlook, link por extenso, rodapé com suporte e "não responda"', () => {
    const { html, texto } = emailDoConvite(base);
    expect(html).toContain('max-width:600px');
    expect(html).toContain('bgcolor="#4A3059"');
    expect(html).toContain(`src="${LOGO_PADRAO}"`);
    expect(html).toContain('width="117" height="36" alt="LHG"');
    expect(html).toMatch(/>HUB<\/span>/);
    expect(html).toContain('v:roundrect');
    expect(html).toContain('Se o botão não funcionar, copie e cole');
    expect(html).toContain(`mailto:${SUPORTE_EMAIL}`);
    expect(html).toContain('não responda');
    expect(html).toContain('<meta name="color-scheme" content="light only">');
    // versão texto completa: marca, link sozinho numa linha, suporte
    expect(texto.startsWith('HUB LHG\n')).toBe(true);
    expect(texto.split('\n')).toContain(LINK);
    expect(texto).toContain(SUPORTE_URL);
  });

  it('sem rastreador nem imagem de terceiros: a ÚNICA imagem é o logo, do domínio da LHG; sem CSS/fonte externa', () => {
    for (const m of [
      emailDoConvite(base),
      emailDeRedefinicao({
        para: 'x@example.invalid',
        nome: 'X',
        link: LINK,
        minutos: 30,
      }),
    ]) {
      const imgs = m.html.match(/<img\b[^>]*>/g) ?? [];
      expect(imgs).toHaveLength(1);
      expect(imgs[0]).toContain('https://hub.lhgmoteis.com.br/');
      expect(m.html).not.toMatch(/<link\b|@import|url\(|background-image/i);
      expect(m.html).not.toMatch(
        /https?:\/\/(?!hub\.lhgmoteis\.com\.br\/|hub\.exemplo\.invalid\/|www\.w3\.org\/1999\/xhtml)[^"'\s<]+/,
      );
    }
  });

  it('EMAIL_LOGO_URL troca o logo, mas só https sem credenciais (senão, o padrão)', () => {
    const antes = process.env.EMAIL_LOGO_URL;
    try {
      process.env.EMAIL_LOGO_URL =
        'https://hub.lhgmoteis.com.br/email/logo-maior.png';
      expect(emailDoConvite(base).html).toContain(
        'src="https://hub.lhgmoteis.com.br/email/logo-maior.png"',
      );
      for (const ruim of [
        'http://hub.lhgmoteis.com.br/x.png',
        'https://u:s@hub.lhgmoteis.com.br/x.png',
        'javascript:alert(1)',
        'lixo',
      ]) {
        process.env.EMAIL_LOGO_URL = ruim;
        expect(emailDoConvite(base).html).toContain(`src="${LOGO_PADRAO}"`);
      }
    } finally {
      if (antes === undefined) delete process.env.EMAIL_LOGO_URL;
      else process.env.EMAIL_LOGO_URL = antes;
    }
  });

  it('e-mail do esqueci a senha: título, validade, botão, motivo próprio', () => {
    const m = emailDeRedefinicao({
      para: 'x@example.invalid',
      nome: 'Pessoa X',
      link: LINK,
      minutos: 30,
    });
    expect(m.assunto).toBe('Redefinir a sua senha do HUB LHG');
    for (const t of [m.html, m.texto]) {
      expect(t).toContain('Olá, Pessoa X.');
      expect(t).toContain('30 minutos');
      expect(t).toContain('Criar uma nova senha');
      expect(t).toContain(
        'porque alguém pediu uma senha nova para este e-mail',
      );
    }
  });

  it('escaparHtml cobre & < > " e apóstrofo', () => {
    expect(escaparHtml(`a&b<c>"d'`)).toBe('a&amp;b&lt;c&gt;&quot;d&#39;');
  });
});
