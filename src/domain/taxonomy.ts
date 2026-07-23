import type { Identity, TaxonomyNode, TaxonomyRank, WoodDatabase, WoodRecord } from '../types/wood';

export const TAXONOMY_RANKS: readonly TaxonomyRank[] = [
  'kingdom',
  'phylum',
  'clade',
  'class',
  'order',
  'family',
  'genus',
  'species',
];

export function taxonomyById(taxonomy: readonly TaxonomyNode[]): ReadonlyMap<number, TaxonomyNode> {
  return new Map(taxonomy.map((node) => [node.id, node]));
}

export function taxonomyLineage(
  taxonomy: readonly TaxonomyNode[],
  taxonomyId: number | null,
): TaxonomyNode[] {
  if (taxonomyId === null) return [];

  const nodesById = taxonomyById(taxonomy);
  const lineage: TaxonomyNode[] = [];
  const visited = new Set<number>();
  let current = nodesById.get(taxonomyId);

  while (current) {
    if (visited.has(current.id)) return [];
    visited.add(current.id);
    lineage.push(current);
    current = current.parentId === null ? undefined : nodesById.get(current.parentId);
  }

  return lineage.reverse();
}

export function taxonAtRank(
  taxonomy: readonly TaxonomyNode[],
  taxonomyId: number | null,
  rank: TaxonomyRank,
): TaxonomyNode | null {
  return taxonomyLineage(taxonomy, taxonomyId).find((node) => node.rank === rank) ?? null;
}

export function recordTaxonomy(
  database: Pick<WoodDatabase, 'taxonomy'>,
  record: Pick<WoodRecord, 'identity'>,
): TaxonomyNode[] {
  return taxonomyLineage(database.taxonomy, record.identity.taxonomyId);
}

export function identityFamily(
  database: Pick<WoodDatabase, 'taxonomy'>,
  identity: Pick<Identity, 'family' | 'taxonomyId'>,
): string | null {
  return taxonAtRank(database.taxonomy, identity.taxonomyId, 'family')?.name ?? identity.family ?? null;
}
