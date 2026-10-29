import { safeLaunchUrl } from './launcher.service';

describe('safeLaunchUrl', () => {
  it('aceita https com host', () => {
    expect(safeLaunchUrl('https://cms.exemplo.invalid/auth/hub/login')).toBe(
      'https://cms.exemplo.invalid/auth/hub/login',
    );
  });

  it.each([
    null,
    undefined,
    '',
    'http://cms.exemplo.invalid/',
    'javascript:alert(1)',
    'data:text/html,oi',
    '//cms.exemplo.invalid/',
    'https://usuario:senha@cms.exemplo.invalid/',
    'https://usuario@cms.exemplo.invalid/',
    'não é url',
  ])('recusa %p', (valor) => {
    expect(safeLaunchUrl(valor as any)).toBeNull();
  });
});
