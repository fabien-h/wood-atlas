import { X } from 'lucide-react';
import { useEffect, type ReactNode, type RefObject } from 'react';
import {
  defaultFilters,
  type FilterFacets,
  type Filters,
  type RangeFilter as RangeFilterValue,
} from '../../domain/filters';
import type { Translation } from '../../i18n';
import styles from './FilterDrawer.module.css';

interface FilterDrawerProps {
  open: boolean;
  facets: FilterFacets;
  filters: Filters;
  triggerRef: RefObject<HTMLButtonElement | null>;
  copy: Translation;
  onChange: (filters: Filters) => void;
  onClose: () => void;
}

export function FilterDrawer({
  open,
  facets,
  filters,
  triggerRef,
  copy,
  onChange,
  onClose,
}: FilterDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      onClose();
      triggerRef.current?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose, triggerRef]);

  return (
    <>
      <div
        className={`${styles.backdrop} ${open ? styles.open : ''}`}
        data-testid="filter-backdrop"
        aria-hidden="true"
        onClick={() => {
          onClose();
          triggerRef.current?.focus();
        }}
      />
      <aside
        id="filter-panel"
        className={`${styles.drawer} ${open ? styles.open : ''}`}
        aria-labelledby="filter-panel-title"
        aria-hidden={!open}
        inert={open ? undefined : true}
      >
        <header className={styles.header}>
          <h2 id="filter-panel-title">{copy.filters}</h2>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={copy.hideFilters}
            title={copy.hideFilters}
            onClick={() => {
              onClose();
              triggerRef.current?.focus();
            }}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div className={styles.stack}>
          <FilterGroup label={copy.origin}>
            <ChipSet
              values={facets.regions}
              selected={filters.regions}
              labels={copy.regions}
              onChange={(regions) => onChange({ ...filters, regions })}
            />
          </FilterGroup>

          <FilterGroup label={copy.appearance}>
            <SelectFilter
              label={copy.colour}
              values={facets.colours}
              value={filters.colours}
              onChange={(colours) => onChange({ ...filters, colours })}
              allLabel={copy.all}
            />
            <SelectFilter
              label={copy.texture}
              values={facets.textures}
              value={filters.textures}
              onChange={(textures) => onChange({ ...filters, textures })}
              allLabel={copy.all}
            />
            <SelectFilter
              label={copy.grain}
              values={facets.grains}
              value={filters.grains}
              onChange={(grains) => onChange({ ...filters, grains })}
              allLabel={copy.all}
            />
          </FilterGroup>

          <FilterGroup label={copy.durability}>
            <SelectFilter
              label={copy.fungi}
              values={facets.fungi}
              value={filters.fungi}
              onChange={(fungi) => onChange({ ...filters, fungi })}
              allLabel={copy.all}
            />
            <SelectFilter
              label={copy.dryWoodBorers}
              values={facets.dryWoodBorers}
              value={filters.dryWoodBorers}
              onChange={(dryWoodBorers) => onChange({ ...filters, dryWoodBorers })}
              allLabel={copy.all}
            />
            <SelectFilter
              label={copy.termites}
              values={facets.termites}
              value={filters.termites}
              onChange={(termites) => onChange({ ...filters, termites })}
              allLabel={copy.all}
            />
            <SelectFilter
              label={copy.treatability}
              values={facets.treatability}
              value={filters.treatability}
              onChange={(treatability) => onChange({ ...filters, treatability })}
              allLabel={copy.all}
            />
            <SelectFilter
              label={copy.naturalUseClass}
              values={facets.naturalUseClasses}
              value={filters.naturalUseClasses}
              onChange={(naturalUseClasses) => onChange({ ...filters, naturalUseClasses })}
              allLabel={copy.all}
            />
            <label className={styles.inputRow}>
              <span>CITES</span>
              <select
                value={filters.cites}
                onChange={(event) =>
                  onChange({ ...filters, cites: event.target.value as Filters['cites'] })
                }
              >
                <option value="all">{copy.all}</option>
                <option value="listed">{copy.listed}</option>
                <option value="not-listed">{copy.notListed}</option>
                <option value="unknown">{copy.unknown}</option>
              </select>
            </label>
          </FilterGroup>

          <FilterGroup label={copy.performance}>
            <RangeFilter
              label={copy.density}
              value={filters.density}
              copy={copy}
              onChange={(density) => onChange({ ...filters, density })}
            />
            <RangeFilter
              label={copy.monninHardness}
              value={filters.hardness}
              copy={copy}
              onChange={(hardness) => onChange({ ...filters, hardness })}
            />
            <RangeFilter
              label={copy.radialShrinkageShort}
              value={filters.radialShrinkage}
              copy={copy}
              onChange={(radialShrinkage) => onChange({ ...filters, radialShrinkage })}
            />
            <RangeFilter
              label={copy.tangentialShrinkageShort}
              value={filters.tangentialShrinkage}
              copy={copy}
              onChange={(tangentialShrinkage) => onChange({ ...filters, tangentialShrinkage })}
            />
            <RangeFilter
              label={copy.elasticityMpa}
              value={filters.modulus}
              copy={copy}
              onChange={(modulus) => onChange({ ...filters, modulus })}
            />
          </FilterGroup>

          <FilterGroup label={copy.useAndDrying}>
            <label className={styles.inputRow}>
              <span>{copy.endUse}</span>
              <select
                value={filters.endUse}
                onChange={(event) => onChange({ ...filters, endUse: event.target.value })}
              >
                <option value="">{copy.all}</option>
                {facets.endUses.map((use) => (
                  <option value={use} key={use}>
                    {use}
                  </option>
                ))}
              </select>
            </label>
            <SelectFilter
              label={copy.drying}
              values={facets.drying}
              value={filters.drying}
              onChange={(drying) => onChange({ ...filters, drying })}
              allLabel={copy.all}
            />
          </FilterGroup>
        </div>

        <button
          type="button"
          className={styles.clearButton}
          onClick={() => onChange(defaultFilters)}
        >
          {copy.clearFilters}
        </button>
      </aside>
    </>
  );
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className={styles.group}>
      <h3 className={styles.groupTitle}>{label}</h3>
      <div className={styles.groupContent}>{children}</div>
    </section>
  );
}

function ChipSet({
  values,
  selected,
  onChange,
  labels = {},
}: {
  values: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  labels?: Record<string, string>;
}) {
  return (
    <div className={styles.chipSet}>
      {values.map((value) => {
        const isSelected = selected.includes(value);
        return (
          <button
            type="button"
            key={value}
            className={`${styles.chip} ${isSelected ? styles.selected : ''}`}
            aria-pressed={isSelected}
            onClick={() =>
              onChange(
                isSelected ? selected.filter((item) => item !== value) : [...selected, value],
              )
            }
          >
            {labels[value] ?? value}
          </button>
        );
      })}
    </div>
  );
}

function SelectFilter({
  label,
  values,
  value,
  onChange,
  allLabel,
}: {
  label: string;
  values: string[];
  value: string[];
  onChange: (next: string[]) => void;
  allLabel: string;
}) {
  return (
    <label className={styles.inputRow}>
      <span>{label}</span>
      <select
        aria-label={label}
        value={value[0] ?? ''}
        onChange={(event) => onChange(event.target.value ? [event.target.value] : [])}
      >
        <option value="">{allLabel}</option>
        {values.map((item) => (
          <option value={item} key={item}>
            {item}
          </option>
        ))}
      </select>
    </label>
  );
}

function RangeFilter({
  label,
  value,
  copy,
  onChange,
}: {
  label: string;
  value: RangeFilterValue;
  copy: Translation;
  onChange: (next: RangeFilterValue) => void;
}) {
  return (
    <fieldset className={styles.rangeRow}>
      <legend>{label}</legend>
      <input
        type="number"
        inputMode="decimal"
        placeholder={copy.minimum}
        aria-label={`${label} — ${copy.minimum}`}
        value={value.min}
        onChange={(event) => onChange({ ...value, min: event.target.value })}
      />
      <input
        type="number"
        inputMode="decimal"
        placeholder={copy.maximum}
        aria-label={`${label} — ${copy.maximum}`}
        value={value.max}
        onChange={(event) => onChange({ ...value, max: event.target.value })}
      />
    </fieldset>
  );
}
