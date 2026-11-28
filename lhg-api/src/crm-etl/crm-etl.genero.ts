/**
 * Gênero corrigido pelo 1º nome (contrato-raw-v1, A1; regra das Premissas:
 * "o Automo grava vazio como MASCULINO").
 *
 * O CRM não recebe nome, então a correção acontece aqui, em memória: o 1º nome
 * só é usado para consultar um dicionário e NUNCA vai para o raw nem para log.
 *
 * Dicionário por unidade, montado dos próprios cadastros do Automo: para cada
 * 1º nome, quantos clientes estão como FEMININO e quantos como MASCULINO.
 *  - nome feminino: pelo menos 3 FEMININO e FEMININO ≥ 50% dos dois;
 *  - nome masculino: pelo menos 3 MASCULINO e FEMININO ≤ 5%.
 * (Como o MASCULINO inclui os vazios gravados por padrão, basta metade de
 * FEMININO para o nome ser feminino; para ser masculino, quase nenhum.)
 *
 * Decisão por cliente, nesta ordem:
 *  1. Automo FEMININO → F (fonte automo): o FEMININO é sempre uma escolha.
 *  2. 1º nome feminino no dicionário → F (fonte nome).
 *  3. 1º nome masculino no dicionário → M (fonte nome).
 *  4. Automo MASCULINO (nome desconhecido/ambíguo) → M (fonte automo).
 *  5. Resto (vazio, OUTRO, sem nome conhecido) → sem gênero.
 */
export type Genero = 'F' | 'M';
export type FonteGenero = 'automo' | 'nome';

export const GENERO_MIN_OCORRENCIAS = 3;

/** Contagem por 1º nome nos cadastros de clientes da unidade (só agregados). */
export const SQL_DICIONARIO_NOMES = `
SELECT upper(split_part(trim(p.nome), ' ', 1)) AS nome,
       count(*) FILTER (WHERE upper(trim(p.sexo)) = 'FEMININO')::int AS f,
       count(*) FILTER (WHERE upper(trim(p.sexo)) = 'MASCULINO')::int AS m
FROM pessoa p
JOIN pessoapapel pp ON pp.id_pessoa = p.id
JOIN cliente cl ON cl.id = pp.id
WHERE coalesce(trim(p.nome), '') <> ''
GROUP BY 1
HAVING count(*) >= ${GENERO_MIN_OCORRENCIAS}`;

/** 1º nome normalizado: maiúsculas, sem acento e só letras. */
export function normalizarNome(nome: string | null | undefined): string {
  return (nome ?? '')
    .trim()
    .split(/\s+/)[0]
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
}

export function montarDicionario(linhas: { nome: string | null; f: number | string; m: number | string }[]) {
  // Nomes que só diferem por acento (MÁRCIA / MARCIA) somam juntos.
  const soma = new Map<string, { f: number; m: number }>();
  for (const l of linhas) {
    const n = normalizarNome(l.nome);
    if (!n) continue;
    const s = soma.get(n) ?? { f: 0, m: 0 };
    s.f += Number(l.f);
    s.m += Number(l.m);
    soma.set(n, s);
  }
  const dic = new Map<string, Genero>();
  for (const [n, { f, m }] of soma) {
    const total = f + m;
    if (!total) continue;
    if (f >= GENERO_MIN_OCORRENCIAS && f / total >= 0.5) dic.set(n, 'F');
    else if (m >= GENERO_MIN_OCORRENCIAS && f / total <= 0.05) dic.set(n, 'M');
  }
  return dic;
}

export function generoDe(
  sexo: string | null | undefined,
  primeiroNome: string | null | undefined,
  dic: ReadonlyMap<string, Genero> | undefined,
): { genero: Genero | null; genero_fonte: FonteGenero | null } {
  const s = (sexo ?? '').trim().toUpperCase();
  if (s === 'FEMININO') return { genero: 'F', genero_fonte: 'automo' };
  const pelo = dic?.get(normalizarNome(primeiroNome));
  if (pelo) return { genero: pelo, genero_fonte: 'nome' };
  if (s === 'MASCULINO') return { genero: 'M', genero_fonte: 'automo' };
  return { genero: null, genero_fonte: null };
}
