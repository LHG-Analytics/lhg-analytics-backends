export interface JwtPayload {
  sub: number;
  email: string;
  unit: "LHG" | "LUSH_LAPA" | "LUSH_IPIRANGA" | "TOUT" | "ANDAR_DE_CIMA"; // Tipos de unidades
  role:
    | "ADMIN"
    | "GERENTE_GERAL"
    | "GERENTE_FINANCEIRO"
    | "GERENTE_RESERVAS"
    | "GERENTE_RESTAURANTE"
    | "GERENTE_OPERACIONAL"; // Tipos de cargos
}
