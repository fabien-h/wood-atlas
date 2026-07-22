import type { Translation } from '../i18n';
import styles from './RegionBadge.module.css';

export function RegionBadge({ region, copy }: { region: string; copy: Translation }) {
  return <span className={styles.label}>{copy.regions[region] ?? region}</span>;
}
