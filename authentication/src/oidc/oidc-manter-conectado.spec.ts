import { marcouManterConectado } from './oidc-interactions';
import { loadOidcProvider } from './oidc-loader';
import {
  INATIVIDADE_MAX,
  LEMBRAR_ABSOLUTO,
  LEMBRAR_INATIVIDADE_MAX,
  marcarManterConectado,
  ttlDaSessao,
} from './oidc.mount';

const DIA = 24 * 60 * 60;

describe('"Manter conectado" (sessão SSO)', () => {
  const agora = 1_800_000_000;

  it('desmarcado: 24 h sem uso, no máximo 7 dias desde o login (como antes)', () => {
    expect(ttlDaSessao(agora, agora)).toBe(INATIVIDADE_MAX);
    expect(ttlDaSessao(agora - 7 * DIA + 90, agora)).toBe(90);
    expect(ttlDaSessao(undefined, agora)).toBe(INATIVIDADE_MAX);
  });

  it('marcado: 7 dias sem uso, no máximo 30 dias desde o login', () => {
    expect(LEMBRAR_INATIVIDADE_MAX).toBe(7 * DIA);
    expect(LEMBRAR_ABSOLUTO).toBe(30 * DIA);
    expect(ttlDaSessao(agora, agora, true)).toBe(7 * DIA);
    expect(ttlDaSessao(agora - 25 * DIA, agora, true)).toBe(5 * DIA);
    expect(ttlDaSessao(agora - 30 * DIA + 60, agora, true)).toBe(60);
    expect(ttlDaSessao(agora - 31 * DIA, agora, true)).toBe(1);
  });

  it('só o valor exato "1" conta como marcado', () => {
    expect(marcouManterConectado({ lembrar: '1' })).toBe(true);
    for (const v of [undefined, '', '0', 'on', 'true', 1, ['1']])
      expect(marcouManterConectado({ lembrar: v })).toBe(false);
    expect(marcouManterConectado(undefined)).toBe(false);
  });

  describe('marca na sessão', () => {
    class SessaoFalsa {
      static get IN_PAYLOAD() {
        return ['accountId', 'loginTs', 'transient'];
      }
      accountId?: string;
      transient?: boolean;
      lembrar?: boolean;
      loginAccount(d: { accountId: string; transient?: boolean }) {
        this.accountId = d.accountId;
        if (d.transient) this.transient = true;
      }
    }
    const provider = { Session: SessaoFalsa };
    marcarManterConectado(provider);
    marcarManterConectado(provider); // idempotente

    it('grava o campo "lembrar" no payload, uma vez só', () => {
      const campos = SessaoFalsa.IN_PAYLOAD;
      expect(campos.filter((c) => c === 'lembrar')).toHaveLength(1);
      expect(campos).toEqual(
        expect.arrayContaining(['accountId', 'loginTs', 'transient']),
      );
    });

    it('login marcado (remember=true → transient=false) ganha a marca', () => {
      const s = new SessaoFalsa();
      s.loginAccount({ accountId: 'a', transient: false });
      expect(s.lembrar).toBe(true);
      expect(s.transient).toBeUndefined();
    });

    it('login desmarcado (transient) não ganha a marca, nem herda de antes', () => {
      const s = new SessaoFalsa();
      s.lembrar = true;
      s.loginAccount({ accountId: 'a', transient: true });
      expect(s.lembrar).toBeUndefined();
      expect(s.transient).toBe(true);
    });
  });

  it('com o oidc-provider de verdade: a marca vai para o payload gravado', async () => {
    const Provider = await loadOidcProvider();
    const gravados: Record<string, unknown>[] = [];
    class Memoria {
      async upsert(_id: string, payload: Record<string, unknown>) {
        gravados.push(payload);
      }
      async find() {
        return undefined;
      }
      async findByUid() {
        return undefined;
      }
      async destroy() {}
    }
    const p = new Provider('https://exemplo.invalid/auth/oidc', {
      adapter: Memoria,
    });
    marcarManterConectado(p);
    const s1 = new p.Session({ uid: 'u1' });
    s1.loginAccount({ accountId: 'a', transient: false });
    await s1.save(60);
    const s2 = new p.Session({ uid: 'u2' });
    s2.loginAccount({ accountId: 'b', transient: true });
    await s2.save(60);
    expect(gravados[0]).toMatchObject({ accountId: 'a', lembrar: true });
    expect(gravados[0]).not.toHaveProperty('transient');
    expect(gravados[1]).toMatchObject({ accountId: 'b', transient: true });
    expect(gravados[1]).not.toHaveProperty('lembrar');
  });
});
