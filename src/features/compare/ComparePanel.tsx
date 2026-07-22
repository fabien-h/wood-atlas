import { X } from 'lucide-react';
import { durabilityScore, formatMeasure, winningIndexes } from '../../domain/woods';
import type { Translation } from '../../i18n';
import type { WoodRecord } from '../../types/wood';
import styles from './ComparePanel.module.css';

export function ComparePanel({
  woods,
  onRemove,
  onClear,
  copy,
}: {
  woods: WoodRecord[];
  onRemove: (id: string) => void;
  onClear: () => void;
  copy: Translation;
}) {
  const rows = compareRows(copy);
  return (
    <section className={styles.panel} aria-labelledby="comparison-title">
      <h2 id="comparison-title">
        <span>
          {copy.comparison} ({woods.length})
        </span>
        <button type="button" className={styles.clearButton} onClick={onClear}>
          {copy.clearComparison}
        </button>
      </h2>
      <div className={styles.scroll}>
        <table>
          <caption className="sr-only">{copy.comparisonTableCaption}</caption>
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">{copy.characteristic}</span>
              </th>
              {woods.map((wood) => (
                <th scope="col" key={wood.id}>
                  <div className={styles.woodHeading}>
                    {wood.images[0] && (
                      <span
                        className={styles.woodGrain}
                        style={{ backgroundImage: `url("${wood.images[0].src}")` }}
                        aria-hidden="true"
                      />
                    )}
                    <span className={styles.woodName}>{wood.identity.displayName}</span>
                    <button
                      type="button"
                      onClick={() => onRemove(wood.id)}
                      title={`${copy.remove} ${wood.identity.displayName}`}
                      aria-label={`${copy.remove} ${wood.identity.displayName}`}
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const winners = winningIndexes(woods, row.getScore, row.better);
              return (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  {woods.map((wood, index) => (
                    <td className={winners.includes(index) ? styles.winner : ''} key={wood.id}>
                      {row.getValue(wood)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function compareRows(copy: Translation) {
  const metrics = [
    {
      label: copy.density,
      unit: '',
      better: 'high' as const,
      get: (wood: WoodRecord) => wood.physics.specificGravity,
    },
    {
      label: copy.hardness,
      unit: '',
      better: 'high' as const,
      get: (wood: WoodRecord) => wood.physics.monninHardness,
    },
    {
      label: copy.radialShrinkage,
      unit: '%',
      better: 'low' as const,
      get: (wood: WoodRecord) => wood.physics.totalRadialShrinkage,
    },
    {
      label: copy.tangentialShrinkageShort,
      unit: '%',
      better: 'low' as const,
      get: (wood: WoodRecord) => wood.physics.totalTangentialShrinkage,
    },
    {
      label: copy.elasticity,
      unit: 'MPa',
      better: 'high' as const,
      get: (wood: WoodRecord) => wood.physics.modulusOfElasticity,
    },
  ];
  return [
    ...metrics.map((metric) => ({
      label: metric.label,
      getValue: (wood: WoodRecord) => formatMeasure(metric.get(wood), metric.unit, copy),
      getScore: (wood: WoodRecord) => metric.get(wood).value,
      better: metric.better,
    })),
    {
      label: copy.fungi,
      getValue: (wood: WoodRecord) => wood.durability.fungi.value ?? copy.unknown,
      getScore: (wood: WoodRecord) => durabilityScore(wood.durability.fungi.raw),
      better: 'low' as const,
    },
    {
      label: copy.termites,
      getValue: (wood: WoodRecord) => wood.durability.termites.value ?? copy.unknown,
      getScore: (wood: WoodRecord) => durabilityScore(wood.durability.termites.raw),
      better: 'low' as const,
    },
    {
      label: copy.treatability,
      getValue: (wood: WoodRecord) => wood.durability.treatability.value ?? copy.unknown,
      getScore: (wood: WoodRecord) => durabilityScore(wood.durability.treatability.raw),
      better: 'low' as const,
    },
  ];
}
