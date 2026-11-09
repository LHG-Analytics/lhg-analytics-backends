import * as crypto from 'crypto';
import {
  INTERACAO_TTL_MS,
  MemoriaDeInteracoes,
  hostReservado,
} from './oidc-interacao-memoria';
import {
  ENTRAR_LIMITE_MS,
  origensHttpsExatas,
  SCRIPT_ENTRAR,
  SCRIPT_VOLTAR,
  cspComScript,
  cspDoOidc,
  paginaInteracaoPerdida,
  paginaLogin,
} from './oidc-pages';

const hash = (s: string) =>
  `'sha256-${crypto.createHash('sha256').update(s, 'utf8').digest('base64')}'`;

describe('MemoriaDeInteracoes (uid → client_id)', () => {
  it('guarda e devolve o client_id; desconhecido ou inválido → null', () => {
    const m = new MemoriaDeInteracoes();
    m.registrar('u1', 'cms');
    expect(m.clienteDe('u1')).toBe('cms');
    expect(m.clienteDe('u2')).toBeNull();
    expect(m.clienteDe(null)).toBeNull();
    m.registrar('', 'cms');
    m.registrar('u3', undefined);
    m.registrar(['u4'], 'cms');
    expect(m.tamanho).toBe(1);
  });

  it('TTL de 60 min (o mesmo da interação no provedor)', () => {
    let agora = 1_000_000;
    const m = new MemoriaDeInteracoes(INTERACAO_TTL_MS, 100, () => agora);
    m.registrar('u1', 'cms');
    agora += INTERACAO_TTL_MS - 1;
    expect(m.clienteDe('u1')).toBe('cms');
    agora += 2;
    expect(m.clienteDe('u1')).toBeNull();
    expect(m.tamanho).toBe(0);
  });

  it('limite de tamanho: saem os mais antigos; vencidos saem ao registrar', () => {
    let agora = 0;
    const m = new MemoriaDeInteracoes(1000, 3, () => agora);
    for (const u of ['a', 'b', 'c', 'd']) m.registrar(u, 'cms');
    expect(m.tamanho).toBe(3);
    expect(m.clienteDe('a')).toBeNull();
    expect(m.clienteDe('d')).toBe('cms');
    agora += 2000;
    m.registrar('e', 'hub');
    expect(m.tamanho).toBe(1);
    expect(m.clienteDe('e')).toBe('hub');
  });
});

describe('hostReservado (launchUrl de exemplo não vira destino)', () => {
  it.each([
    ['https://analytics.exemplo.invalid/auth/hub/login', true],
    ['https://x.example/a', true],
    ['https://x.test/a', true],
    ['https://localhost/a', true],
    ['https://www.example.com/a', true],
    ['lixo', true],
    ['https://analytics.lhgmoteis.com.br/auth/api/hub/login', false],
    ['https://cms.lhgmoteis.com.br/api/auth/hub/login', false],
  ])('%s → %s', (u, esperado) => {
    expect(hostReservado(u)).toBe(esperado);
  });
});

describe('telas: Entrar travado no 1º envio e interação perdida com saída', () => {
  const csp = cspDoOidc(['https://cms.exemplo.invalid']);

  it('a tela de login leva o script fixo; o CSP da resposta recebe o hash dele', () => {
    const p = paginaLogin({
      acao: '/auth/oidc/interaction/u1',
      erro: null,
      google: false,
    });
    expect(p).toContain('id="form-entrar"');
    expect(p).toContain('id="botao-entrar"');
    expect(p).toContain(`<script>${SCRIPT_ENTRAR}</script>`);
    expect(cspComScript(csp, SCRIPT_ENTRAR)).toContain(hash(SCRIPT_ENTRAR));
    // trava no submit (clique e Enter), mostra "Entrando…" e libera no pageshow
    expect(SCRIPT_ENTRAR).toContain("addEventListener('submit'");
    expect(SCRIPT_ENTRAR).toContain('e.preventDefault()');
    expect(SCRIPT_ENTRAR).toContain('b.disabled=true');
    expect(SCRIPT_ENTRAR).toContain('Entrando…');
    expect(SCRIPT_ENTRAR).toContain("addEventListener('pageshow'");
    // o 1º envio segue: o botão só é desligado no próximo tique, já serializado
    expect(SCRIPT_ENTRAR).toContain('setTimeout(travar,0)');
    // o 2º clique não gera evento; o Enter é barrado no keydown
    expect(SCRIPT_ENTRAR).toContain("b.setAttribute('aria-disabled','true')");
    expect(SCRIPT_ENTRAR).toContain("b.style.pointerEvents='none'");
    expect(SCRIPT_ENTRAR).toContain(
      "addEventListener('keydown',function(e){if(enviando&&e.key==='Enter')e.preventDefault()}",
    );
    // sem resposta em 20 s: libera e avisa
    expect(ENTRAR_LIMITE_MS).toBe(20000);
    expect(SCRIPT_ENTRAR).toContain('},20000)');
    expect(SCRIPT_ENTRAR).toContain(
      'Demorou mais que o normal. Tente de novo.',
    );
    expect(p).toContain('id="aviso-entrar"');
    // o script é JavaScript válido
    expect(() => new Function(SCRIPT_ENTRAR)).not.toThrow();
  });

  it('interação perdida (b2): "Ir para o HUB LHG" (portal) + "Voltar"; sem envio automático', () => {
    const p = paginaInteracaoPerdida('https://hub.lhgmoteis.com.br/');
    expect(p).toContain('href="https://hub.lhgmoteis.com.br/"');
    expect(p).toContain('Ir para o HUB LHG');
    expect(p).toContain('id="voltar"');
    expect(p).toContain(`<script>${SCRIPT_VOLTAR}</script>`);
    expect(p).not.toMatch(
      /http-equiv="refresh"|\.submit\(\)|location\.(href|replace|assign)/,
    );
    expect(paginaInteracaoPerdida(null)).not.toContain('Ir para o HUB LHG');
  });
});

describe('form-action: origens extras (front do Analytics, lista por variável)', () => {
  it('só https exatas; lixo, http, curinga e credenciais são ignorados', () => {
    expect(
      origensHttpsExatas(
        ' https://analytics-front-dev.lhgmoteis.com.br/ , https://analytics-front.lhgmoteis.com.br/x?y=1,http://a.test,https://*.lhgmoteis.com.br,https://u:p@x.test,lixo,,',
      ),
    ).toEqual([
      'https://analytics-front-dev.lhgmoteis.com.br',
      'https://analytics-front.lhgmoteis.com.br',
    ]);
    expect(origensHttpsExatas(undefined)).toEqual([]);
  });

  it('as origens entram no form-action sem afrouxar o resto', () => {
    const csp = cspDoOidc([
      'https://analytics-dev.lhgmoteis.com.br',
      ...origensHttpsExatas('https://analytics-front-dev.lhgmoteis.com.br'),
    ]);
    expect(csp).toContain(
      "form-action 'self' https://analytics-dev.lhgmoteis.com.br https://analytics-front-dev.lhgmoteis.com.br",
    );
    expect(csp).not.toMatch(/form-action[^;]*(\*|https:\s|https:;)/);
  });
});
