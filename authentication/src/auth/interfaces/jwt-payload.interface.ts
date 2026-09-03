export interface JwtPayload {
  id: number;
  email: string;
  name: string;
  unit:
    | 'LHG'
    | 'LUSH_LAPA'
    | 'LUSH_IPIRANGA'
    | 'TOUT'
    | 'ANDAR_DE_CIMA'
    | 'LIV'
    | 'ALTANA'
    | 'GETAN_GARAVELO'
    | 'GETAN_PQ_OESTE'
    | 'GETAN_INDEPENDENCIA'
    | 'GETAN_NOVO_MUNDO'
    | 'GETAN_VERA_CRUZ'
    | 'GETAN_GRID'; // Tipos de unidades
  role:
    | 'ADMIN'
    | 'GERENTE_GERAL'
    | 'GERENTE_FINANCEIRO'
    | 'GERENTE_RESERVAS'
    | 'GERENTE_RESTAURANTE'
    | 'GERENTE_OPERACIONAL'; // Tipos de cargos
}
