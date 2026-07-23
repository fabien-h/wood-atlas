import { ExternalLink, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { PhysicalProfileChart } from '../../components/PhysicalProfileChart';
import {
  commonName,
  formatMeasure,
  formatNumber,
  hasMeasure,
  hasNotes,
  hasTextValue,
  isMeaningful,
} from '../../domain/woods';
import { originCodes } from '../../domain/geography';
import { identityFamily, recordTaxonomy, TAXONOMY_RANKS } from '../../domain/taxonomy';
import {
  displayContinentNames,
  displayCountryNames,
  formatLocalizedList,
  type Translation,
} from '../../i18n';
import type { NumericMeasure, TaxonomyNode, WoodImage, WoodRecord } from '../../types/wood';
import styles from './DetailDrawer.module.css';

interface DetailDrawerProps {
  wood?: WoodRecord;
  taxonomy: TaxonomyNode[];
  copy: Translation;
  onClose: () => void;
}

export function DetailDrawer({ wood, taxonomy, copy, onClose }: DetailDrawerProps) {
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
            <DetailContent
              wood={wood}
              taxonomy={taxonomy}
              copy={copy}
              onClose={onClose}
              elevated={isScrolled}
            />
          </Dialog>
        </Modal>
      )}
    </ModalOverlay>
  );
}

function DetailContent({
  wood,
  taxonomy,
  copy,
  onClose,
  elevated,
}: {
  wood: WoodRecord;
  taxonomy: TaxonomyNode[];
  copy: Translation;
  onClose: () => void;
  elevated: boolean;
}) {
  const [zoomedImage, setZoomedImage] = useState<WoodImage | null>(null);
  const grainImages = wood.images.filter((image) => image.kind !== 'example');
  const exampleImages = wood.images.filter((image) => image.kind === 'example');
  const name = commonName(wood);
  const localizedEndUses = [...new Set(wood.endUses)];
  const lineage = recordTaxonomy({ taxonomy }, wood);
  const family = identityFamily({ taxonomy }, wood.identity);
  const taxonomyFields = TAXONOMY_RANKS.flatMap((rank) => {
    const matchingNodes = lineage.filter((node) => node.rank === rank);
    if (matchingNodes.length > 0) return matchingNodes;
    return rank === 'family' && family
      ? [{ id: -1, parentId: null, rank: 'family' as const, name: family }]
      : [];
  });
  const normalizedOrigin = originCodes({
    continentCodes: wood.origin.continentCodes ?? [],
    countryCodes: wood.origin.countryCodes ?? [],
  });
  const continentNames = displayContinentNames(normalizedOrigin.continentCodes, copy.locale);
  const countryNames = displayCountryNames(normalizedOrigin.countryCodes, copy.locale);
  const continentValue =
    continentNames.length > 0
      ? formatLocalizedList(continentNames, copy.locale)
      : wood.origin.continent;
  const countryValue =
    countryNames.length > 0
      ? formatLocalizedList(countryNames, copy.locale)
      : formatLocalizedList((wood.origin.countries ?? []).filter(isMeaningful), copy.locale);
  const hasIdentity =
    [wood.cites.raw, wood.identity.commercialRestrictions?.value].some(isMeaningful) ||
    hasNotes(wood.identity.notes);
  const hasOrigin = [continentValue, countryValue].some(isMeaningful);
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
      wood.physics.jankaHardness,
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
      wood.durability.sapwoodTreatability,
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
          {name}
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
        <div
          className={styles.imagePair}
          role="group"
          aria-label={`${name} — ${copy.descriptionOfWood}`}
        >
          {grainImages.slice(0, 2).map((image) => (
            <WoodImageFigure
              image={image}
              name={name}
              copy={copy}
              onZoom={() => setZoomedImage(image)}
              key={image.src}
            />
          ))}
        </div>
      )}

      {hasIdentity && (
        <DetailSection title={copy.identity}>
          <KV label="CITES" value={wood.cites.raw} />
          <KV
            label={copy.commercialRestrictions}
            value={wood.identity.commercialRestrictions?.value}
          />
          <NotesList notes={wood.identity.notes} />
        </DetailSection>
      )}

      {hasOrigin && (
        <DetailSection title={copy.origin}>
          <KV label={copy.continent} value={continentValue} />
          <KV label={copy.country} value={countryValue} />
        </DetailSection>
      )}

      {taxonomyFields.length > 0 && (
        <DetailSection title={copy.botany}>
          {taxonomyFields.map((node) => (
            <KV
              label={copy.taxonomyRanks[node.rank]}
              value={node.name}
              key={node.id === -1 ? `fallback:${node.rank}` : node.id}
            />
          ))}
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

      {wood.additionalDetails?.map((section) => (
        <DetailSection title={section.title} key={section.id}>
          {section.fields.map((field) => (
            <KV
              label={field.label}
              value={field.value}
              valueLanguage={field.valueLanguage}
              key={`${field.label}:${field.value}`}
            />
          ))}
        </DetailSection>
      ))}

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
          <MeasureKV label={copy.jankaHardness} measure={wood.physics.jankaHardness} copy={copy} />
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
          <KV label={copy.heartwoodTreatability} value={wood.durability.treatability.value} />
          <KV label={copy.sapwoodTreatability} value={wood.durability.sapwoodTreatability?.value} />
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
              <ZoomableImage
                image={image}
                name={name}
                copy={copy}
                onZoom={() => setZoomedImage(image)}
                key={image.src}
              />
            ))}
          </div>
        </DetailSection>
      )}

      <SourceSection wood={wood} copy={copy} />

      <ImageLightbox
        image={zoomedImage}
        name={name}
        copy={copy}
        onClose={() => setZoomedImage(null)}
      />
    </>
  );
}

function WoodImageFigure({
  image,
  name,
  copy,
  onZoom,
}: {
  image: WoodImage;
  name: string;
  copy: Translation;
  onZoom: () => void;
}) {
  return (
    <figure>
      <ZoomableImage image={image} name={name} copy={copy} onZoom={onZoom} />
      <figcaption>
        <span>{image.kind === 'flatSawn' ? copy.flatSawn : copy.quarterSawn}</span>
        <ImageCredit credit={image.credit} />
      </figcaption>
    </figure>
  );
}

function ZoomableImage({
  image,
  name,
  copy,
  onZoom,
}: {
  image: WoodImage;
  name: string;
  copy: Translation;
  onZoom: () => void;
}) {
  const alt = woodImageAlt(image, name, copy);
  return (
    <button type="button" className={styles.imageButton} aria-haspopup="dialog" onClick={onZoom}>
      <img src={image.src} alt={alt} />
    </button>
  );
}

function ImageLightbox({
  image,
  name,
  copy,
  onClose,
}: {
  image: WoodImage | null;
  name: string;
  copy: Translation;
  onClose: () => void;
}) {
  if (!image) return null;
  const alt = woodImageAlt(image, name, copy);
  const label =
    image.kind === 'flatSawn'
      ? copy.flatSawn
      : image.kind === 'quarterSawn'
        ? copy.quarterSawn
        : copy.example;

  return (
    <ModalOverlay
      isOpen
      isDismissable
      className={styles.lightboxOverlay}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      onClick={onClose}
    >
      <Modal className={styles.lightboxModal}>
        <Dialog aria-label={alt} className={styles.lightboxDialog}>
          <figure>
            <img className={styles.lightboxImage} src={image.src} alt={alt} />
            <figcaption>
              <span>{label}</span>
              <ImageCredit credit={image.credit} />
            </figcaption>
          </figure>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

function woodImageAlt(image: WoodImage, woodName: string, copy: Translation) {
  const label =
    image.kind === 'flatSawn'
      ? copy.flatSawn
      : image.kind === 'quarterSawn'
        ? copy.quarterSawn
        : copy.example;
  return `${woodName} — ${label}`;
}

function ImageCredit({ credit }: { credit: WoodImage['credit'] }) {
  if (!credit) return null;
  return (
    <span className={styles.imageCredit}>
      <a href={credit.sourceUrl}>{credit.creator}</a>
      {' · '}
      <a href={credit.licenseUrl}>{credit.license}</a>
    </span>
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

function KV({
  label,
  value,
  valueLanguage,
}: {
  label: string;
  value: string | null | undefined;
  valueLanguage?: string;
}) {
  if (!isMeaningful(value)) return null;
  return (
    <dl className={styles.kv}>
      <dt>{label}</dt>
      <dd dir="auto" lang={valueLanguage}>
        {value}
      </dd>
    </dl>
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

function SourceSection({ wood, copy }: { wood: WoodRecord; copy: Translation }) {
  const sourceLanguage = copy.locale.startsWith('fr') ? 'fr' : 'en';
  const listingUrl =
    wood.source.listingUrls?.[sourceLanguage] ??
    wood.source.listingUrls?.en ??
    wood.source.listingUrls?.fr;
  const sourceLinks = [
    ...(listingUrl
      ? [
          {
            title: wood.source.provider,
            url: listingUrl,
            detail: null,
          },
        ]
      : []),
    ...(wood.source.references ?? []).map((reference) => ({
      title: reference.title,
      url: reference.url,
      detail: [reference.publisher, reference.year]
        .filter((value) => value !== null && value !== '')
        .join(' · '),
    })),
  ].filter(
    (link, index, links) => links.findIndex((candidate) => candidate.url === link.url) === index,
  );

  if (!isMeaningful(wood.source.provider) && sourceLinks.length === 0) return null;
  return (
    <DetailSection title={copy.aboutDataSourcesTitle}>
      <p className={styles.sourceProvider}>{wood.source.provider}</p>
      {sourceLinks.length > 0 && (
        <div className={styles.sourceLinks}>
          {sourceLinks.map((link) => (
            <a href={link.url} target="_blank" rel="noreferrer" key={link.url}>
              <span>
                <strong>{link.title}</strong>
                {link.detail && <small>{link.detail}</small>}
              </span>
              <ExternalLink size={16} aria-hidden="true" />
            </a>
          ))}
        </div>
      )}
    </DetailSection>
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
