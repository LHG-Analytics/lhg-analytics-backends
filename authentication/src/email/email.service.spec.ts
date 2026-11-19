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
      expect(t).toContain('Acesso liberado: CMS, Help Desk.');
      expect(t).toContain('O convite vale até 26/11/2026.');
      expect(t).toContain(LINK);
      expect(t).toContain(
        'Se você não esperava este convite, ignore este e-mail.',
      );
    }
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
    expect(m.texto).not.toContain('Acesso liberado');
    expect(m.texto).toContain('O convite não tem prazo de validade.');
  });

  it('escaparHtml cobre & < > " e apóstrofo', () => {
    expect(escaparHtml(`a&b<c>"d'`)).toBe('a&amp;b&lt;c&gt;&quot;d&#39;');
  });
});
