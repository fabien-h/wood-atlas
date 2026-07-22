import { ArrowDown, ArrowUp, Check, ChevronRight } from 'lucide-react';
import {
  commonName,
  formatMeasure,
  primaryGrainImage,
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
    ['density', copy.density],
    ['hardness', copy.hardness],
    ['radialShrinkage', copy.radial],
    ['tangentialShrinkage', copy.tangential],
    ['modulus', copy.elasticityMpa],
    ['fungi', copy.fungi],
    ['termites', copy.termites],
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
                colSpan={10}
                role={status === 'error' ? 'alert' : 'status'}
              >
                {status === 'error' ? copy.loadError : copy.loadingWoods}
              </td>
            </tr>
          ) : woods.length === 0 ? (
            <tr>
              <td className={styles.status} colSpan={10}>
                {copy.noWoods}
              </td>
            </tr>
          ) : (
            woods.map((wood) => {
              const selected = selectedIds.includes(wood.id);
              const grainImage = primaryGrainImage(wood);
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
                      {grainImage ? (
                        <span
                          className={styles.grainImage}
                          style={{ backgroundImage: `url("${grainImage.src}")` }}
                          aria-hidden="true"
                        />
                      ) : (
                        <span className={styles.grainPlaceholder} aria-hidden="true" />
                      )}
                      <span className={styles.nameText}>
                        <strong>{name}</strong>
                        <span>{wood.identity.family ?? copy.unknownFamily}</span>
                      </span>
                      <ChevronRight className={styles.openIcon} size={16} aria-hidden="true" />
                    </button>
                  </td>
                  <td>
                    <RegionBadge region={wood.origin.region} copy={copy} />
                  </td>
                  <td>{formatMeasure(wood.physics.specificGravity, undefined, copy)}</td>
                  <td>{formatMeasure(wood.physics.monninHardness, undefined, copy)}</td>
                  <td>{formatMeasure(wood.physics.totalRadialShrinkage, '%', copy)}</td>
                  <td>{formatMeasure(wood.physics.totalTangentialShrinkage, '%', copy)}</td>
                  <td>{formatMeasure(wood.physics.modulusOfElasticity, null, copy)}</td>
                  <td>{shortClass(wood.durability.fungi.raw, copy)}</td>
                  <td>{shortClass(wood.durability.termites.raw, copy)}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
