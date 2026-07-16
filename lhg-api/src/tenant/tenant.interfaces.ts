/**
 * Interfaces do sistema multi-tenant.
 * Cada unidade (motel) é um TenantConfig no registry — adicionar uma unidade nova
 * é adicionar um registro em tenant.registry.ts + a env var do banco. Nada mais.
 */

/** Estratégia de identificação de camareiras terceirizadas (varia por unidade) */
export type TerceirizadosStrategy =
  | { kind: 'byEmployeeIds'; ids: number[] }
  | { kind: 'byNullSchedule' } // sem horarioinicioexpediente = terceirizado (ex.: Liv)
  | { kind: 'none' };

export interface TenantGovernanceConfig {
  /** id_cargo das camareiras */
  camareirasCargoIds: number[];
  /** id_cargo do supervisor (vistorias) */
  supervisorCargoId: number;
  terceirizados: TerceirizadosStrategy;
  /** funcionario.id excluídos do dimensionamento de equipe */
  excludedEmployeeIds: number[];
}

export interface TenantRestaurantConfig {
  /** A ∪ B — tudo que conta como A&B nos big numbers */
  abProductTypeIds: number[];
  /** Alimentos (relatório/gráficos) */
  aProductTypeIds: number[];
  /** Bebidas (relatório/gráficos) */
  bProductTypeIds: number[];
  /** Rankings Mais/Menos Vendidos (subconjuntos) */
  aRankingIds: number[];
  bRankingIds: number[];
  aLeastRankingIds: number[];
  bLeastRankingIds: number[];
  // "Outros" (Produtos Adicionais) é SEMPRE catch-all: NOT IN abProductTypeIds OR NULL.
  // Nunca lista fixa — listas fixas ficam desatualizadas silenciosamente (bug do Altana, jul/2026).
}

/** Classificação de tipos de locação por duração (altana difere das demais) */
export interface RentalTypeThreshold {
  /** rótulo retornado (ex.: 'THREE_HOURS') */
  type: string;
  /** duração máxima em segundos (com tolerância) para cair neste tipo */
  maxSeconds: number;
}

export interface TenantConfig {
  /** slug usado na rota /:unit/api/... e nas chaves de cache (ex.: 'lush_ipiranga') */
  slug: string;
  /** valor do enum UserUnit no JWT (ex.: 'LUSH_IPIRANGA') */
  unitEnum: string;
  /** nome exibido no campo Company dos retornos (ex.: 'Lush Ipiranga') */
  displayName: string;
  /** nome da env var com a connection string do banco AUTOMO da unidade */
  databaseUrlEnv: string;
  /** ca.id das categorias de suíte válidas (filtro de TODAS as queries de KPI) */
  suiteCategoryIds: number[];
  governance: TenantGovernanceConfig;
  restaurant: TenantRestaurantConfig;
  /** thresholds de classificação de locações por duração, em ordem crescente */
  rentalTypes: RentalTypeThreshold[];
}
