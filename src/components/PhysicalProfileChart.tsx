import type { Translation } from '../i18n';
import type { NumericMeasure, WoodRecord } from '../types/wood';
import { commonName } from '../domain/woods';
import styles from './PhysicalProfileChart.module.css';

type BandLabel =
  | 'low'
  | 'medium'
  | 'high'
  | 'veryLight'
  | 'light'
  | 'heavy'
  | 'veryHeavy'
  | 'verySoft'
  | 'soft'
  | 'hard'
  | 'veryHard';

interface Band {
  end: number;
  label: BandLabel;
}

interface ProfileRow {
  key: keyof WoodRecord['physics'];
  label: (copy: Translation) => string;
  domain: [number, number];
  majorTicks: number[];
  minorStep: number;
  bands: Band[];
  labelValue?: (value: number) => string;
  scale?: 'hardness';
}

const rows: ProfileRow[] = [
  {
    key: 'specificGravity',
    label: (copy) => `${copy.specificGravity} *`,
    domain: [0.13, 1.22],
    majorTicks: sequence(0.2, 1.2, 0.1),
    minorStep: 0.01,
    bands: bands(
      [0.5, 0.65, 0.8, 0.95, 1.22],
      ['veryLight', 'light', 'medium', 'heavy', 'veryHeavy'],
    ),
  },
  {
    key: 'monninHardness',
    label: (copy) => `${copy.monninHardness} *`,
    domain: [0.1, 21],
    majorTicks: [1, 2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 18, 20],
    minorStep: 0.2,
    bands: bands([1.5, 3, 6, 9, 21], ['verySoft', 'soft', 'medium', 'hard', 'veryHard']),
    scale: 'hardness',
  },
  {
    key: 'volumetricShrinkageCoefficient',
    label: (copy) => `${copy.volumetricShrinkage} (%)`,
    domain: [0.2, 0.83],
    majorTicks: sequence(0.3, 0.8, 0.1),
    minorStep: 0.01,
    bands: bands([0.35, 0.55, 0.83], ['low', 'medium', 'high']),
  },
  {
    key: 'totalTangentialShrinkage',
    label: (copy) => `${copy.tangentialShrinkage} (%)`,
    domain: [3.5, 12.25],
    majorTicks: sequence(4, 12, 1),
    minorStep: 0.1,
    bands: bands([6.5, 10, 12.25], ['low', 'medium', 'high']),
  },
  {
    key: 'totalRadialShrinkage',
    label: (copy) => `${copy.radialShrinkage} (%)`,
    domain: [1.5, 10.15],
    majorTicks: sequence(2, 10, 1),
    minorStep: 0.1,
    bands: bands([3.8, 6.5, 10.15], ['low', 'medium', 'high']),
  },
  {
    key: 'crushingStrength',
    label: (copy) => `${copy.crushingStrength} (MPa) *`,
    domain: [9, 117.5],
    majorTicks: sequence(10, 110, 10),
    minorStep: 1,
    bands: bands([45, 75, 117.5], ['low', 'medium', 'high']),
  },
  {
    key: 'staticBendingStrength',
    label: (copy) => `${copy.bendingStrength} (MPa) *`,
    domain: [20, 216],
    majorTicks: sequence(25, 200, 25),
    minorStep: 5,
    bands: bands([75, 125, 216], ['low', 'medium', 'high']),
  },
  {
    key: 'modulusOfElasticity',
    label: (copy) => `${copy.elasticity} (×1000 MPa) *`,
    domain: [4500, 33500],
    majorTicks: sequence(6000, 32000, 2000),
    minorStep: 1000,
    bands: bands([12500, 18500, 33500], ['low', 'medium', 'high']),
    labelValue: (value) => String(value / 1000),
  },
];

const plotLeft = 198;
const plotRight = 799;
const plotWidth = plotRight - plotLeft;
const rowHeight = 52;
const rulerHeight = 32;

export function PhysicalProfileChart({ wood, copy }: { wood: WoodRecord; copy: Translation }) {
  const values = rows.map((row) => measureFor(wood, row.key).value);
  const path = profilePath(values);
  const title = `${copy.physicsAndMechanics}: ${commonName(wood)}`;
  const rtl = copy.locale.startsWith('ar') || copy.locale.startsWith('ur');

  return (
    <div className={styles.scroll}>
      <svg
        className={styles.chart}
        viewBox="0 0 800 444"
        role="img"
        lang={copy.locale}
        direction="ltr"
        aria-labelledby={`profile-${wood.id}-title profile-${wood.id}-desc`}
      >
        <title id={`profile-${wood.id}-title`}>{title}</title>
        <desc id={`profile-${wood.id}-desc`}>{title}</desc>
        {rows.map((row, index) => (
          <ChartRow
            row={row}
            index={index}
            copy={copy}
            rtl={rtl}
            value={values[index]}
            key={row.key}
          />
        ))}
        {path && <path className={styles.line} d={path} />}
        <text className={styles.footnote} x="4" y="438" direction={rtl ? 'rtl' : 'ltr'}>
          {withMonoNumbers(copy.atTwelvePercentMoisture)}
        </text>
      </svg>
    </div>
  );
}

function ChartRow({
  row,
  index,
  copy,
  rtl,
  value,
}: {
  row: ProfileRow;
  index: number;
  copy: Translation;
  rtl: boolean;
  value: number | null;
}) {
  const y = index * rowHeight;
  const labels = wrapLabel(row.label(copy));
  const minorTicks =
    row.scale === 'hardness'
      ? [...sequence(0.1, 6, 0.1), ...sequence(6.5, 21, 0.5)]
      : sequence(
          Math.ceil(row.domain[0] / row.minorStep) * row.minorStep,
          Math.floor(row.domain[1] / row.minorStep) * row.minorStep,
          row.minorStep,
        );
  const majorKeys = new Set(row.majorTicks.map(tickKey));
  let bandStart = row.domain[0];

  return (
    <g>
      <text
        className={styles.label}
        x={plotLeft - 10}
        y={y + (labels.length === 1 ? 21 : 13)}
        textAnchor="end"
        direction={rtl ? 'rtl' : 'ltr'}
      >
        {labels.map((label, labelIndex) => (
          <tspan x={plotLeft - 10} dy={labelIndex === 0 ? 0 : 12} key={label}>
            {withMonoNumbers(label)}
          </tspan>
        ))}
      </text>
      <rect
        className={styles.rulerBackground}
        x={plotLeft}
        y={y}
        width={plotWidth}
        height={rulerHeight}
      />
      <rect
        className={styles.bandBackground}
        x={plotLeft}
        y={y + rulerHeight}
        width={plotWidth}
        height={rowHeight - rulerHeight}
      />
      {minorTicks.map((tick) => {
        const x = scaleX(row, tick);
        const major = majorKeys.has(tickKey(tick));
        return (
          <line
            className={major ? styles.majorTick : styles.minorTick}
            x1={x}
            x2={x}
            y1={y + (major ? 16 : 23)}
            y2={y + rulerHeight}
            key={`${row.key}-${tickKey(tick)}`}
          />
        );
      })}
      {row.majorTicks.map((tick) => (
        <text
          className={styles.tickLabel}
          x={scaleX(row, tick)}
          y={y + 11}
          textAnchor="middle"
          key={`${row.key}-label-${tick}`}
        >
          {row.labelValue ? row.labelValue(tick) : formatTick(tick)}
        </text>
      ))}
      {value === null && (
        <text className={styles.missing} x={plotRight - 8} y={y + 22} textAnchor="end">
          —
        </text>
      )}
      {value !== null && (value < row.domain[0] || value > row.domain[1]) && (
        <circle className={styles.overflow} cx={scaleX(row, value)} cy={y + 17} r="4">
          <title>{value}</title>
        </circle>
      )}
      {row.bands.map((band) => {
        const startX = scaleX(row, bandStart);
        const endX = scaleX(row, band.end);
        const result = (
          <g key={`${row.key}-${band.end}`}>
            <line
              className={styles.bandBoundary}
              x1={endX}
              x2={endX}
              y1={y + rulerHeight}
              y2={y + rowHeight}
            />
            <text
              className={styles.bandLabel}
              x={(startX + endX) / 2}
              y={y + 46}
              textAnchor="middle"
              direction={rtl ? 'rtl' : 'ltr'}
            >
              {copy[band.label]}
            </text>
          </g>
        );
        bandStart = band.end;
        return result;
      })}
      <rect className={styles.rowFrame} x={plotLeft} y={y} width={plotWidth} height={rowHeight} />
    </g>
  );
}

function profilePath(values: Array<number | null>) {
  const parts: string[] = [];
  let continuing = false;
  values.forEach((value, index) => {
    if (value === null) {
      continuing = false;
      return;
    }
    const x = scaleX(rows[index], value);
    const y = index * rowHeight;
    if (!continuing) parts.push(`M ${x} ${y}`);
    else parts.push(`L ${x} ${y}`);
    parts.push(`V ${y + rulerHeight}`);
    continuing = true;
  });
  return parts.join(' ');
}

function withMonoNumbers(value: string) {
  return value.split(/(\p{N}+(?:[.,]\p{N}+)*)/gu).map((part, index) =>
    /\p{N}/u.test(part) ? (
      <tspan className={styles.number} key={`${part}-${index}`}>
        {part}
      </tspan>
    ) : (
      part
    ),
  );
}

function scaleX(row: ProfileRow, value: number) {
  const clamped = Math.min(Math.max(value, row.domain[0]), row.domain[1]);
  if (row.scale === 'hardness') {
    const split = 6;
    const fraction =
      clamped <= split
        ? ((clamped - row.domain[0]) / (split - row.domain[0])) * 0.66
        : 0.66 + ((clamped - split) / (row.domain[1] - split)) * 0.34;
    return plotLeft + fraction * plotWidth;
  }
  return plotLeft + ((clamped - row.domain[0]) / (row.domain[1] - row.domain[0])) * plotWidth;
}

function measureFor(wood: WoodRecord, key: keyof WoodRecord['physics']): NumericMeasure {
  return wood.physics[key] as NumericMeasure;
}

function bands(ends: number[], labels: BandLabel[]): Band[] {
  return ends.map((end, index) => ({ end, label: labels[index] }));
}

function wrapLabel(value: string) {
  const maximum = 28;
  if (value.length <= maximum) return [value];
  const midpoint = Math.floor(value.length / 2);
  const spaces = [...value.matchAll(/\s+/g)].map((match) => match.index ?? 0);
  const split =
    spaces.length > 0
      ? spaces.reduce((best, index) =>
          Math.abs(index - midpoint) < Math.abs(best - midpoint) ? index : best,
        )
      : midpoint;
  return [value.slice(0, split).trim(), value.slice(split).trim()].filter(Boolean);
}

function sequence(start: number, end: number, step: number) {
  const count = Math.floor((end - start) / step + 0.000001);
  return Array.from({ length: count + 1 }, (_, index) => Number((start + index * step).toFixed(6)));
}

function tickKey(value: number) {
  return value.toFixed(6);
}

function formatTick(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
