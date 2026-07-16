/**
 * Contrato do JWT emitido pelo serviço authentication.
 * Cópia local intencional: o lhg-api NÃO compila junto o projeto authentication
 * (removemos o acoplamento @auth/* que os backends por unidade tinham).
 * Se o payload mudar no emissor, atualizar aqui.
 */
export interface JwtPayload {
  id: number;
  email: string;
  name: string;
  unit:
    | 'LUSH_LAPA'
    | 'LUSH_IPIRANGA'
    | 'TOUT'
    | 'ANDAR_DE_CIMA'
    | 'LHG'
    | 'LIV'
    | 'ALTANA';
  role:
    | 'ADMIN'
    | 'GERENTE_GERAL'
    | 'GERENTE_FINANCEIRO'
    | 'GERENTE_RESERVAS'
    | 'GERENTE_RESTAURANTE'
    | 'GERENTE_OPERACIONAL';
  iat?: number;
  exp?: number;
}
