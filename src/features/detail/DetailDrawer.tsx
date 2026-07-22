import { X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { PhysicalProfileChart } from '../../components/PhysicalProfileChart';
import {
  formatMeasure,
  formatNumber,
  hasMeasure,
  hasNotes,
  hasTextValue,
  isMeaningful,
} from '../../domain/woods';
import type { Translation } from '../../i18n';
import type { NumericMeasure, WoodRecord } from '../../types/wood';
import styles from './DetailDrawer.module.css';

interface DetailDrawerProps {
  wood?: WoodRecord;
  copy: Translation;
  onClose: () => void;
}

export function DetailDrawer({ wood, copy, onClose }: DetailDrawerProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  useEffect(() => setIsScrolled(false), [wood?.id]);

  return (
    <ModalOverlay
      isOpen={Boolean(wood)}
      isDismissable
      className={`${styles.overlay} ${wood ? '' : styles.closed}`}
      data-testid="detail-overlay"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {wood && (
        <Modal
          key={wood.id}
          className={styles.modal}
          onScroll={(event) => setIsScrolled(event.currentTarget.scrollTop > 0)}
        >
          <Dialog className={styles.dialog}>
            <DetailContent wood={wood} copy={copy} onClose={onClose} elevated={isScrolled} />
          </Dialog>
        </Modal>
      )}
    </ModalOverlay>
  );
}

function DetailContent({
  wood,
  copy,
  onClose,
  elevated,
}: {
  wood: WoodRecord;
  copy: Translation;
  onClose: () => void;
  elevated: boolean;
}) {
  const grainImages = wood.images.filter((image) => image.kind !== 'example');
  const exampleImages = wood.images.filter((image) => image.kind === 'example');
  const localizedEndUses = [...new Set(wood.endUses)];
  const hasIdentity =
    [
      wood.identity.family,
      wood.origin.continent,
      wood.cites.raw,
      wood.identity.commercialRestrictions?.value,
    ].some(isMeaningful) || hasNotes(wood.identity.notes);
  const hasLog =
    hasMeasure(wood.log.diameterCm) ||
    [wood.log.sapwoodThickness, wood.log.floats, wood.log.durability].some(hasTextValue) ||
    hasNotes(wood.log.notes);
  const hasAppearance = Object.values(wood.appearance).some((value) =>
    Array.isArray(value) ? hasNotes(value) : hasTextValue(value),
  );
  const hasPhysics =
    [
      wood.physics.specificGravity,
      wood.physics.monninHardness,
      wood.physics.volumetricShrinkageCoefficient,
      wood.physics.totalTangentialShrinkage,
      wood.physics.totalRadialShrinkage,
      wood.physics.shrinkageRatio,
      wood.physics.fibreSaturationPoint,
      wood.physics.thermalConductivity,
      wood.physics.lowerHeatingValue,
      wood.physics.crushingStrength,
      wood.physics.staticBendingStrength,
      wood.physics.modulusOfElasticity,
    ].some(hasMeasure) ||
    hasTextValue(wood.physics.stability) ||
    hasNotes(wood.physics.notes);
  const hasDurability =
    [
      wood.durability.fungi,
      wood.durability.dryWoodBorers,
      wood.durability.termites,
      wood.durability.treatability,
      wood.durability.naturalUseClass,
      wood.durability.coversUseClass5,
    ].some(hasTextValue) || hasNotes(wood.durability.notes);
  const treatment = wood.durability.preservativeTreatment;
  const hasTreatment =
    [
      treatment.dryWoodBorer,
      treatment.temporaryHumidification,
      treatment.permanentHumidification,
    ].some(hasTextValue) || hasNotes(treatment.notes);
  const hasDrying =
    [
      wood.drying.rate,
      wood.drying.distortionRisk,
      wood.drying.casehardeningRisk,
      wood.drying.checkingRisk,
      wood.drying.collapseRisk,
    ].some(hasTextValue) ||
    hasNotes(wood.drying.notes) ||
    wood.drying.schedule.length > 0 ||
    hasNotes(wood.drying.scheduleNotes);
  const hasMachining =
    [
      wood.machining.bluntingEffect,
      wood.machining.sawteethRecommended,
      wood.machining.cuttingTools,
      wood.machining.peeling,
      wood.machining.slicing,
    ].some(hasTextValue) || hasNotes(wood.machining.notes);
  const hasAssembly =
    [wood.assembly.nailingAndScrewing, wood.assembly.gluing].some(hasTextValue) ||
    hasNotes(wood.assembly.notes);
  const hasGrading = [wood.grading.appearance, wood.grading.structural].some(isMeaningful);
  const hasFire = [
    wood.fireSafety.frenchGrading,
    wood.fireSafety.euroclass.value,
    wood.fireSafety.notes,
  ].some(isMeaningful);

  return (
    <>
      <header className={`${styles.header} ${elevated ? styles.elevated : ''}`}>
        <Heading slot="title" className={styles.heading}>
          {wood.identity.displayName}
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            title={copy.closeDetail}
            aria-label={copy.closeDetail}
          >
            <X size={17} aria-hidden="true" />
          </button>
        </Heading>
        <p>{copy.regions[wood.origin.region] ?? wood.origin.region}</p>
        {wood.identity.botanicalNames.length > 0 && (
          <p>{wood.identity.botanicalNames.map((item) => item.name).join(', ')}</p>
        )}
      </header>

      {grainImages.length > 0 && (
        <div className={styles.imagePair}>
          {grainImages.slice(0, 2).map((image) => (
            <figure key={image.src}>
              <img src={image.src} alt={image.alt} />
              <figcaption>
                {image.kind === 'flatSawn' ? copy.flatSawn : copy.quarterSawn}
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {hasIdentity && (
        <DetailSection title={copy.identity}>
          <KV label={copy.family} value={wood.identity.family} />
          <KV label={copy.continent} value={wood.origin.continent} />
          <KV label="CITES" value={wood.cites.raw} />
          <KV
            label={copy.commercialRestrictions}
            value={wood.identity.commercialRestrictions?.value}
          />
          <NotesList notes={wood.identity.notes} />
        </DetailSection>
      )}

      {hasLog && (
        <DetailSection title={copy.descriptionOfLogs}>
          <MeasureKV label={copy.diameter} measure={wood.log.diameterCm} copy={copy} />
          <KV label={copy.sapwoodThickness} value={wood.log.sapwoodThickness.value} />
          <KV label={copy.floats} value={wood.log.floats.value} />
          <KV label={copy.logDurability} value={wood.log.durability.value} />
          <NotesList notes={wood.log.notes} />
        </DetailSection>
      )}

      {hasAppearance && (
        <DetailSection title={copy.descriptionOfWood}>
          <KV label={copy.colour} value={wood.appearance.colourReference.value} />
          <KV label={copy.sapwood} value={wood.appearance.sapwood.value} />
          <KV label={copy.texture} value={wood.appearance.texture.value} />
          <KV label={copy.grain} value={wood.appearance.grain.value} />
          <KV label={copy.interlockedGrain} value={wood.appearance.interlockedGrain.value} />
          <NotesList notes={wood.appearance.notes} />
        </DetailSection>
      )}

      {hasPhysics && (
        <DetailSection title={copy.physicsAndMechanics}>
          <PhysicalProfileChart wood={wood} copy={copy} />
          <hr className={styles.sectionSeparator} />
          <MeasureKV
            label={copy.specificGravity}
            measure={wood.physics.specificGravity}
            copy={copy}
          />
          <MeasureKV
            label={copy.monninHardness}
            measure={wood.physics.monninHardness}
            copy={copy}
          />
          <MeasureKV
            label={copy.volumetricShrinkage}
            measure={wood.physics.volumetricShrinkageCoefficient}
            copy={copy}
          />
          <MeasureKV
            label={copy.tangentialShrinkage}
            measure={wood.physics.totalTangentialShrinkage}
            copy={copy}
          />
          <MeasureKV
            label={copy.radialShrinkage}
            measure={wood.physics.totalRadialShrinkage}
            copy={copy}
          />
          <MeasureKV
            label={copy.shrinkageRatio}
            measure={wood.physics.shrinkageRatio}
            copy={copy}
          />
          <MeasureKV
            label={copy.fibreSaturationPoint}
            measure={wood.physics.fibreSaturationPoint}
            copy={copy}
          />
          <MeasureKV
            label={copy.thermalConductivity}
            measure={wood.physics.thermalConductivity}
            copy={copy}
          />
          <MeasureKV
            label={copy.lowerHeatingValue}
            measure={wood.physics.lowerHeatingValue}
            copy={copy}
          />
          <MeasureKV
            label={copy.crushingStrength}
            measure={wood.physics.crushingStrength}
            copy={copy}
          />
          <MeasureKV
            label={copy.bendingStrength}
            measure={wood.physics.staticBendingStrength}
            copy={copy}
          />
          <MeasureKV
            label={copy.elasticity}
            measure={wood.physics.modulusOfElasticity}
            copy={copy}
          />
          <KV label={copy.stability} value={wood.physics.stability?.value} />
          <NotesList notes={wood.physics.notes} />
        </DetailSection>
      )}

      {hasDurability && (
        <DetailSection title={copy.durability}>
          <KV label={copy.fungi} value={wood.durability.fungi.value} />
          <KV label={copy.dryWoodBorers} value={wood.durability.dryWoodBorers.value} />
          <KV label={copy.termites} value={wood.durability.termites.value} />
          <KV label={copy.treatability} value={wood.durability.treatability.value} />
          <KV label={copy.naturalUseClass} value={wood.durability.naturalUseClass.value} />
          <KV label={copy.coversUseClass5} value={wood.durability.coversUseClass5?.value} />
          <NotesList notes={wood.durability.notes} />
        </DetailSection>
      )}

      {hasTreatment && (
        <DetailSection title={copy.preservativeTreatment}>
          <KV label={copy.againstDryWoodBorer} value={treatment.dryWoodBorer.value} />
          <KV
            label={copy.temporaryHumidification}
            value={treatment.temporaryHumidification.value}
          />
          <KV
            label={copy.permanentHumidification}
            value={treatment.permanentHumidification.value}
          />
          <NotesList notes={treatment.notes} />
        </DetailSection>
      )}

      {hasDrying && (
        <DetailSection title={copy.drying}>
          <KV label={copy.dryingRate} value={wood.drying.rate.value} />
          <KV label={copy.distortion} value={wood.drying.distortionRisk.value} />
          <KV label={copy.casehardening} value={wood.drying.casehardeningRisk.value} />
          <KV label={copy.checking} value={wood.drying.checkingRisk.value} />
          <KV label={copy.collapse} value={wood.drying.collapseRisk.value} />
          <NotesList notes={wood.drying.notes} />
          {wood.drying.schedule.length > 0 && (
            <DryingSchedule rows={wood.drying.schedule} copy={copy} />
          )}
          <NotesList notes={wood.drying.scheduleNotes} />
        </DetailSection>
      )}

      {hasMachining && (
        <DetailSection title={copy.sawingAndMachining}>
          <KV label={copy.blunting} value={wood.machining.bluntingEffect.value} />
          <KV label={copy.sawteeth} value={wood.machining.sawteethRecommended.value} />
          <KV label={copy.cuttingTools} value={wood.machining.cuttingTools.value} />
          <KV label={copy.peeling} value={wood.machining.peeling.value} />
          <KV label={copy.slicing} value={wood.machining.slicing.value} />
          <NotesList notes={wood.machining.notes} />
        </DetailSection>
      )}

      {hasAssembly && (
        <DetailSection title={copy.assembling}>
          <KV label={copy.nailingAndScrewing} value={wood.assembly.nailingAndScrewing.value} />
          <KV label={copy.gluing} value={wood.assembly.gluing.value} />
          <NotesList notes={wood.assembly.notes} />
        </DetailSection>
      )}

      {hasGrading && (
        <DetailSection title={copy.commercialGrading}>
          <ProseValue label={copy.appearanceGrading} value={wood.grading.appearance} />
          <ProseValue label={copy.structuralGrading} value={wood.grading.structural} />
        </DetailSection>
      )}

      {hasFire && (
        <DetailSection title={copy.fireSafety}>
          <ProseValue label={copy.frenchGrading} value={wood.fireSafety.frenchGrading} />
          <KV label={copy.euroclass} value={wood.fireSafety.euroclass.value} />
          {isMeaningful(wood.fireSafety.notes) && (
            <p className={styles.note}>{wood.fireSafety.notes}</p>
          )}
        </DetailSection>
      )}

      {(localizedEndUses.length > 0 || hasNotes(wood.endUseNotes)) && (
        <DetailSection title={copy.endUses}>
          {localizedEndUses.length > 0 && (
            <div className={styles.endUses}>
              {localizedEndUses.map((use) => (
                <div key={use}>{use}</div>
              ))}
            </div>
          )}
          <NotesList notes={wood.endUseNotes} />
        </DetailSection>
      )}

      {wood.identity.localNames.length > 0 && (
        <DetailSection title={copy.localNames}>
          <div className={styles.tableScroll}>
            <table className={`${styles.dataTable} ${styles.edgePaddedTable}`}>
              <caption className="sr-only">{copy.localNames}</caption>
              <thead>
                <tr>
                  <th scope="col">{copy.country}</th>
                  <th scope="col">{copy.localName}</th>
                </tr>
              </thead>
              <tbody>
                {wood.identity.localNames.map((item, index) => (
                  <tr key={`${item.country}-${item.name}-${index}`}>
                    <td>{item.country}</td>
                    <td>{item.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DetailSection>
      )}

      {exampleImages.length > 0 && (
        <DetailSection title={copy.example}>
          <div className={styles.exampleImages}>
            {exampleImages.map((image) => (
              <img src={image.src} alt={image.alt} key={image.src} />
            ))}
          </div>
        </DetailSection>
      )}
    </>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function KV({ label, value }: { label: string; value: string | null | undefined }) {
  if (!isMeaningful(value)) return null;
  return (
    <div className={styles.kv}>
      <span>{label}</span>
      <strong dir="auto">{value}</strong>
    </div>
  );
}

function MeasureKV({
  label,
  measure,
  copy,
}: {
  label: string;
  measure: NumericMeasure;
  copy: Translation;
}) {
  if (!hasMeasure(measure)) return null;
  const deviation =
    measure.standardDeviation == null
      ? ''
      : ` · ${copy.standardDeviation} ${formatNumber(measure.standardDeviation, 2, copy)}`;
  return <KV label={label} value={`${formatMeasure(measure, undefined, copy)}${deviation}`} />;
}

function ProseValue({ label, value }: { label: string; value: string | null | undefined }) {
  if (!isMeaningful(value)) return null;
  return (
    <div className={styles.prose}>
      <h4>{label}</h4>
      <p>{value}</p>
    </div>
  );
}

function NotesList({ notes }: { notes: string[] | undefined }) {
  if (!hasNotes(notes)) return null;
  return (
    <div className={styles.notes}>
      {notes.filter(isMeaningful).map((item, index) => (
        <p key={`${index}-${item}`}>{item}</p>
      ))}
    </div>
  );
}

function DryingSchedule({
  rows,
  copy,
}: {
  rows: WoodRecord['drying']['schedule'];
  copy: Translation;
}) {
  const hasWetBulb = rows.some((row) => isMeaningful(row.wetBulbTemperatureC));
  return (
    <div className={styles.schedule}>
      <h4>{copy.dryingProgram}</h4>
      <div className={styles.tableScroll}>
        <table className={`${styles.dataTable} ${styles.scheduleTable} ${styles.edgePaddedTable}`}>
          <caption className="sr-only">{copy.dryingProgram}</caption>
          <thead>
            <tr>
              <th scope="col">{copy.phase}</th>
              <th scope="col">{copy.durationHours}</th>
              <th scope="col">{copy.moistureContent}</th>
              <th scope="col">{hasWetBulb ? copy.dryBulbTemperature : copy.temperature}</th>
              {hasWetBulb && <th scope="col">{copy.wetBulbTemperature}</th>}
              <th scope="col">{copy.relativeHumidity}</th>
              <th scope="col">{copy.equilibriumMoisture}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.phase}-${index}`}>
                <td>{row.phase}</td>
                <td>{row.durationHours ?? '—'}</td>
                <td>{row.moistureContent ?? '—'}</td>
                <td>{row.temperatureC ?? '—'}</td>
                {hasWetBulb && <td>{row.wetBulbTemperatureC ?? '—'}</td>}
                <td>{row.relativeHumidityPercent ?? '—'}</td>
                <td>{row.uglPercent ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
