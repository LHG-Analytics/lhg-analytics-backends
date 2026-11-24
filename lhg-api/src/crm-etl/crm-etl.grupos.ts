/**
 * Grupo de consumo de cada item, pelo tipo de produto do Automo (a numeração e
 * os nomes são próprios de cada unidade). As MESMAS regras da wishlist CRM
 * entregue em nov/2026 (scripts/automo-crm, fora do git).
 */
export const GRUPOS_CONSUMO = [
  'Bebidas_Nao_Alcoolicas',
  'Cervejas',
  'Drinks_Doses_Destilados',
  'Vinhos_Espumantes',
  'Cafe_da_Manha',
  'Alimentos',
  'Produtos_Eroticos',
  'Bomboniere_Conveniencia',
  'Pacotes_Decoracao_Servicos',
  'Outros',
] as const;
export type GrupoConsumo = (typeof GRUPOS_CONSUMO)[number];

interface RegrasUnidade {
  grupos: [GrupoConsumo, RegExp][];
  /** Tipos de produto que são pacote/experiência (raw.pacotes_estadia). */
  pacotes: RegExp;
  /** Tipos genéricos que misturam grupos: separa pelo NOME do produto. */
  porNome?: Record<string, (desc: string) => GrupoConsumo>;
}

const bebidasAltana = (desc: string): GrupoConsumo =>
  /CERVEJA|CHOPP|LONG NECK/.test(desc)
    ? 'Cervejas'
    : /ESPUMANTE|CHANDON|PROSECCO|VINHO|^ES |BRUT|MOSCATEL|ROSE/.test(desc)
      ? 'Vinhos_Espumantes'
      : /TEQUILA|WHISK|VODKA|GIN\b|RUM\b|CACHA|LICOR|SAKE|KEEP COOLER|ICE\b|SKOL BEATS|DOSE|CAMPARI|APEROL|JAGER|CONHAQUE/.test(desc)
        ? 'Drinks_Doses_Destilados'
        : 'Bebidas_Nao_Alcoolicas';

const REGRAS: Record<string, RegrasUnidade> = {
  andar_de_cima: {
    grupos: [
      ['Bebidas_Nao_Alcoolicas', /^01 /],
      ['Cervejas', /^02 /],
      ['Drinks_Doses_Destilados', /^0[345] /],
      ['Vinhos_Espumantes', /^06 /],
      ['Cafe_da_Manha', /^08 /],
      ['Alimentos', /^(07|09|10|11|12) /],
      ['Produtos_Eroticos', /^13 /],
      ['Bomboniere_Conveniencia', /^(14|15) |^SOUVENIR/],
      ['Pacotes_Decoracao_Servicos', /^(PACOTE DE PRODUTOS|ADICIONAIS|ITENS EXTRAS|OUTROS SERVICOS)/],
    ],
    pacotes: /^PACOTE DE PRODUTOS/,
  },
  lush_ipiranga: {
    grupos: [
      ['Bebidas_Nao_Alcoolicas', /^01 /],
      ['Cervejas', /^02 /],
      ['Drinks_Doses_Destilados', /^0[345] /],
      ['Vinhos_Espumantes', /^06 /],
      ['Cafe_da_Manha', /^07 /],
      ['Alimentos', /^(09|10|11|12|13|14) |^(FESTIVAL FONDUE|MENU DE VERAO)/],
      ['Produtos_Eroticos', /^16 /],
      ['Bomboniere_Conveniencia', /^(15|17|18) |^SOUVENIR/],
      ['Pacotes_Decoracao_Servicos', /^(PACOTE DE PRODUTOS|08 |ITENS EXTRAS|SERVICOS)/],
    ],
    pacotes: /^PACOTE DE PRODUTOS/,
  },
  tout: {
    grupos: [
      ['Bebidas_Nao_Alcoolicas', /^01 /],
      ['Cervejas', /^02 /],
      ['Drinks_Doses_Destilados', /^0[345] /],
      ['Vinhos_Espumantes', /^0[67] /],
      ['Cafe_da_Manha', /^08 /],
      ['Alimentos', /^(09|10|11|12|13) |^(ALIMENTOS|PIZZAS|FESTIVAL FONDUE)$/],
      ['Produtos_Eroticos', /^(15|17) /],
      ['Bomboniere_Conveniencia', /^(14|16) |^(CIGARROS|SOUVENIRS)$/],
      ['Pacotes_Decoracao_Servicos', /^(PACOTE DE PRODUTOS|18 |EXPERIENCIA$)/],
    ],
    pacotes: /^(PACOTE DE PRODUTOS|EXPERIENCIA$)/,
  },
  lush_lapa: {
    grupos: [
      ['Bebidas_Nao_Alcoolicas', /^09 /],
      ['Cervejas', /^10 /],
      ['Drinks_Doses_Destilados', /^(11|13|14) /],
      ['Vinhos_Espumantes', /^12 /],
      ['Cafe_da_Manha', /^01 /],
      ['Alimentos', /^(03|04|05|06|07|08) |^0 - MENU VERAO|^FESTIVAL FONDUE$/],
      ['Produtos_Eroticos', /^15 /],
      ['Bomboniere_Conveniencia', /^(16|17|18) |^SOUVENIR$/],
      ['Pacotes_Decoracao_Servicos', /^(PACOTE DE PRODUTOS|02\s*- ?ADICIONAIS|ITENS EXTRAS|SERVICOS)/],
    ],
    pacotes: /^PACOTE DE PRODUTOS/,
  },
  altana: {
    grupos: [
      ['Bebidas_Nao_Alcoolicas', /^SOFT DRINKS$/],
      ['Cervejas', /^CERVEJAS$/],
      ['Drinks_Doses_Destilados', /^(COQUETEIS|DESTILADOS|DOSES)$/],
      ['Vinhos_Espumantes', /^VINHOS E ESPUMANTES$/],
      ['Cafe_da_Manha', /^CAFE DA MANHA$/],
      ['Alimentos', /^(ACOMPANHAMENTO|ENTRADAS|LANCHES|PETISCOS|PRATOS PRINCIPAIS|SOBREMESAS)$/],
      ['Produtos_Eroticos', /^SEXSHOP$/],
      ['Bomboniere_Conveniencia', /^(BOMBONIERE|CONVENIENCIA|TABACARIA)$/],
      ['Pacotes_Decoracao_Servicos', /^(PACOTE DE PRODUTOS|ADICIONAIS|SERVICOS)$/],
    ],
    pacotes: /^PACOTE DE PRODUTOS$/,
    porNome: { BEBIDAS: bebidasAltana },
  },
  liv: {
    grupos: [
      ['Bebidas_Nao_Alcoolicas', /^(F|G)\. /],
      ['Drinks_Doses_Destilados', /^I\. /],
      ['Vinhos_Espumantes', /^K\. /],
      ['Cafe_da_Manha', /^E\. /],
      ['Alimentos', /^(A|B|C|D|P|Q)\. /],
      ['Produtos_Eroticos', /^L\. /],
      ['Bomboniere_Conveniencia', /^J\. /],
      ['Pacotes_Decoracao_Servicos', /^PACOTE DE PRODUTOS$/],
    ],
    pacotes: /^PACOTE DE PRODUTOS$/,
    porNome: {
      'H. CERVEZAS | TRAGOS | BOTELLAS': (desc) =>
        /CERVEZA|PROMOCION (CLUB|CORONA|PILSENER)|CLUB VERDE|PILSENER|CORONA/.test(desc)
          ? 'Cervejas'
          : 'Drinks_Doses_Destilados',
    },
  },
};

export function grupoDoItem(slug: string, tipo: string | null, desc: string | null): GrupoConsumo {
  const r = REGRAS[slug];
  if (!r) return 'Outros';
  const t = tipo ?? '';
  const porNome = r.porNome?.[t];
  if (porNome) return porNome(desc ?? '');
  return r.grupos.find(([, re]) => re.test(t))?.[0] ?? 'Outros';
}

export function ehPacote(slug: string, tipo: string | null): boolean {
  return REGRAS[slug]?.pacotes.test(tipo ?? '') ?? false;
}
