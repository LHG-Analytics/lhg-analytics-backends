import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import {
  HELPDESK_TOKEN_TTL_SECONDS,
  HelpdeskService,
  buildHelpdeskClaims,
  signHelpdeskToken,
} from './helpdesk.service';

// Segredo fixo só para teste local (o real fica no Render, nunca no código).
const SECRET = 'segredo-de-teste-local-123';

const user = {
  id: 42,
  email: 'fulano@lushmotel.com.br',
  name: 'Fulano de Tal',
  unit: 'LUSH_IPIRANGA',
  role: 'GERENTE_GERAL',
};

describe('buildHelpdeskClaims', () => {
  it('mapeia o usuário para os claims combinados com o Help Desk', () => {
    expect(buildHelpdeskClaims(user)).toEqual({
      sub: '42',
      email: 'fulano@lushmotel.com.br',
      nome: 'Fulano de Tal',
      unidade: 'LUSH_IPIRANGA',
      cargo: 'GERENTE_GERAL',
      sistema: 'lhg-analytics',
    });
  });

  it('omite nome, unidade e cargo quando não há valor', () => {
    const claims = buildHelpdeskClaims({
      id: 7,
      email: 'a@lhgmoteis.com.br',
      name: '   ',
      unit: null,
      role: undefined,
    });
    expect(claims).toEqual({
      sub: '7',
      email: 'a@lhgmoteis.com.br',
      sistema: 'lhg-analytics',
    });
    expect(claims).not.toHaveProperty('nome');
    expect(claims).not.toHaveProperty('unidade');
    expect(claims).not.toHaveProperty('cargo');
  });
});

describe('signHelpdeskToken', () => {
  it('assina em HS256, sem kid, com iat e exp de 1h', () => {
    const token = signHelpdeskToken(user, SECRET);

    const { header } = jwt.decode(token, { complete: true }) as jwt.Jwt;
    expect(header).toEqual({ alg: 'HS256', typ: 'JWT' });

    const payload = jwt.verify(token, SECRET, {
      algorithms: ['HS256'],
    }) as jwt.JwtPayload;
    expect(payload).toMatchObject({
      sub: '42',
      email: 'fulano@lushmotel.com.br',
      nome: 'Fulano de Tal',
      unidade: 'LUSH_IPIRANGA',
      cargo: 'GERENTE_GERAL',
      sistema: 'lhg-analytics',
    });
    expect(typeof payload.iat).toBe('number');
    expect(payload.exp! - payload.iat!).toBe(HELPDESK_TOKEN_TTL_SECONDS);
  });

  it('não é aceito com outro segredo', () => {
    const token = signHelpdeskToken(user, SECRET);
    expect(() => jwt.verify(token, 'outro-segredo')).toThrow();
  });
});

describe('HelpdeskService', () => {
  const service = (secret?: string) =>
    new HelpdeskService({
      get: (key: string) =>
        key === 'HELPDESK_JWT_SECRET' ? secret : undefined,
    } as unknown as ConfigService);

  it('devolve { token } quando HELPDESK_JWT_SECRET está configurado', () => {
    const { token } = service(SECRET).createToken(user);
    expect(jwt.verify(token, SECRET)).toMatchObject({ sub: '42' });
  });

  it('responde 503 quando HELPDESK_JWT_SECRET não está configurado', () => {
    expect(() => service(undefined).createToken(user)).toThrow(
      ServiceUnavailableException,
    );
  });
});
