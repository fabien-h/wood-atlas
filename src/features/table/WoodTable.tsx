import { ArrowDown, ArrowUp, Check, ChevronRight } from 'lucide-react';
import {
  commonName,
  formatMeasure,
  shortClass,
  type SortKey,
  type WoodSort,
} from '../../domain/woods';
import type { Translation } from '../../i18n';
import type { WoodRecord } from '../../types/wood';
import { RegionBadge } from '../../components/RegionBadge';
import styles from './WoodTable.module.css';

interface WoodTableProps {
  woods: WoodRecord[];
  selectedIds: string[];
  activeId?: string;
  sort: WoodSort;
  status: 'loading' | 'ready' | 'error';
  onSort: (key: SortKey) => void;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  copy: Translation;
}

export function WoodTable({
  woods,
  selectedIds,
  activeId,
  sort,
  status,
  onSort,
  onSelect,
  onOpen,
  copy,
}: WoodTableProps) {
  const headers: Array<[SortKey, string]> = [
    ['name', `${woods.length.toLocaleString(copy.locale)} ${copy.wood}`],
    ['region', copy.origin],
    ['naturalUseClass', copy.naturalUseClass],
    ['fungi', copy.fungi],
    ['termites', copy.termites],
    ['treatability', copy.treatability],
    ['hardness', copy.hardness],
    ['density', copy.density],
    ['radialShrinkage', copy.radial],
    ['tangentialShrinkage', copy.tangential],
    ['modulus', copy.elasticityMpa],
  ];

  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <caption className="sr-only">{copy.woodTableCaption}</caption>
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">{copy.select}</span>
            </th>
            {headers.map(([key, label]) => (
              <th
                scope="col"
                key={key}
                aria-sort={
                  sort.key === key && sort.direction !== 'none'
                    ? sort.direction === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                }
              >
                <button
                  type="button"
                  onClick={() => onSort(key)}
                  aria-label={`${copy.sortBy} ${label}`}
                  title={`${copy.sortBy} ${label}`}
                >
                  {label}
                  {sort.key === key && sort.direction === 'asc' && (
                    <ArrowUp size={13} aria-hidden="true" className={styles.sortIcon} />
                  )}
                  {sort.key === key && sort.direction === 'desc' && (
                    <ArrowDown size={13} aria-hidden="true" className={styles.sortIcon} />
                  )}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {status !== 'ready' ? (
            <tr>
              <td
                className={styles.status}
                colSpan={12}
                role={status === 'error' ? 'alert' : 'status'}
              >
                {status === 'error' ? copy.loadError : copy.loadingWoods}
              </td>
            </tr>
          ) : woods.length === 0 ? (
            <tr>
              <td className={styles.status} colSpan={12}>
                {copy.noWoods}
              </td>
            </tr>
          ) : (
            woods.map((wood) => {
              const selected = selectedIds.includes(wood.id);
              const thumbnail = wood.thumbnail;
              const name = commonName(wood);
              return (
                <tr
                  className={activeId === wood.id ? styles.activeRow : ''}
                  key={wood.id}
                  onClick={() => onOpen(wood.id)}
                >
                  <td onClick={(event) => event.stopPropagation()}>
                    <button
                      type="button"
                      className={`${styles.selectToggle} ${selected ? styles.selected : ''}`}
                      onClick={() => onSelect(wood.id)}
                      title={`${copy.compare} ${name}`}
                      aria-label={`${copy.compare} ${name}`}
                      aria-pressed={selected}
                      disabled={!selected && selectedIds.length >= 5}
                    >
                      <Check size={9} aria-hidden="true" />
                    </button>
                  </td>
                  <td className={styles.nameCell}>
                    <button
                      type="button"
                      className={styles.nameButton}
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpen(wood.id);
                      }}
                      aria-label={`${copy.openWoodDetails} ${name}`}
                      title={`${copy.openWoodDetails} ${name}`}
                    >
                      {thumbnail ? (
                        <span
                          className={styles.thumbnailImage}
                          style={{ backgroundImage: `url("${thumbnail.src}")` }}
                          aria-hidden="true"
                        />
                      ) : (
                        <span className={styles.thumbnailPlaceholder} aria-hidden="true" />
                      )}
                      <span className={styles.nameText}>
                        <strong>{name}</strong>
                        <span>{wood.identity.family ?? '-'}</span>
                      </span>
                      <ChevronRight className={styles.openIcon} size={16} aria-hidden="true" />
                    </button>
                  </td>
                  <td>
                    {wood.origin.region === 'Unknown' ? (
                      '-'
                    ) : (
                      <RegionBadge region={wood.origin.region} copy={copy} />
                    )}
                  </td>
                  <td>{formatTableClass(wood.durability.naturalUseClass.raw, copy)}</td>
                  <td>{formatTableClass(wood.durability.fungi.raw, copy, 'fungi')}</td>
                  <td>{formatTableClass(wood.durability.termites.raw, copy, 'termites')}</td>
                  <td>
                    {formatTableClass(wood.durability.treatability.raw, copy, 'treatability')}
                  </td>
                  <td>{formatTableMeasure(wood.physics.monninHardness, undefined, copy)}</td>
                  <td>{formatTableMeasure(wood.physics.specificGravity, undefined, copy)}</td>
                  <td>{formatTableMeasure(wood.physics.totalRadialShrinkage, '%', copy)}</td>
                  <td>{formatTableMeasure(wood.physics.totalTangentialShrinkage, '%', copy)}</td>
                  <td>{formatTableMeasure(wood.physics.modulusOfElasticity, null, copy)}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function formatTableMeasure(
  measure: WoodRecord['physics']['specificGravity'],
  unit: string | null | undefined,
  copy: Translation,
) {
  return measure.value === null ? '-' : formatMeasure(measure, unit, copy);
}

function formatTableClass(
  value: string | null,
  copy: Translation,
  kind: 'fungi' | 'termites' | 'treatability' | 'naturalUseClass' = 'fungi',
) {
  const formatted = shortClass(value, copy, kind);
  return formatted === copy.unknown ? '-' : formatted;
}
