export interface JwtPayload {
    id: number;
    email: string;
    name: string;
    unit: 'LHG' | 'LUSH_LAPA' | 'LUSH_IPIRANGA' | 'TOUT' | 'ANDAR_DE_CIMA';
    role: 'ADMIN' | 'GERENTE_GERAL' | 'GERENTE_FINANCEIRO' | 'GERENTE_RESERVAS' | 'GERENTE_RESTAURANTE' | 'GERENTE_OPERACIONAL';
}
