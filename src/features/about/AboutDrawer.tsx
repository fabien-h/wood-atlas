import { ExternalLink, Mail, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import type { Translation } from '../../i18n';
import styles from './AboutDrawer.module.css';

const GITHUB_REPOSITORY_URL = 'https://github.com/fabien-h/wood-atlas';
const TROPIX_URL = 'https://tropix.cirad.fr/';
const BIOWOOEB_URL = 'https://ur-biowooeb.cirad.fr/';
const USDA_FPL_URL = 'https://www.fpl.fs.usda.gov/';
const BRAZILIAN_LPF_URL =
  'https://dados.florestal.gov.br/dataset/banco-de-dados-de-madeiras-brasileiras-do-lpf-sfb';
const WOOD_DATABASE_URL = 'https://www.wood-database.com/wood-filter/';
const IPT_WOOD_URL = 'https://madeiras.ipt.br/';
const OSU_DURABILITY_URL =
  'https://juniper.oregonstate.edu/bibliography/natural-durability-wood-worldwide-checklist-species';
const CONTACT_EMAIL = 'fabien.huet@gmail.com';

export function AboutDrawer({
  open,
  copy,
  onClose,
}: {
  open: boolean;
  copy: Translation;
  onClose: () => void;
}) {
  return (
    <ModalOverlay
      isOpen={open}
      isDismissable
      className={styles.overlay}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <Modal className={styles.modal}>
        <Dialog className={styles.dialog}>
          <header className={styles.header}>
            <Heading slot="title" className={styles.heading}>
              <span>{copy.aboutTitle}</span>
              <button
                type="button"
                className={styles.closeButton}
                onClick={onClose}
                title={copy.closeAbout}
                aria-label={copy.closeAbout}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </Heading>
          </header>

          <section className={styles.introduction}>
            <p>{copy.aboutOpenSource}</p>
            <ExternalLinkRow href={GITHUB_REPOSITORY_URL}>GitHub</ExternalLinkRow>
          </section>

          <section className={styles.sources}>
            <h3>{copy.aboutDataSourcesTitle}</h3>
            <p>{copy.aboutDataSources}</p>
            <div className={styles.links}>
              <ExternalLinkRow href={TROPIX_URL}>Tropix</ExternalLinkRow>
              <ExternalLinkRow href={BIOWOOEB_URL}>BioWooEB</ExternalLinkRow>
              <ExternalLinkRow href={USDA_FPL_URL}>USDA Forest Products Laboratory</ExternalLinkRow>
              <ExternalLinkRow href={BRAZILIAN_LPF_URL}>
                Brazilian Forest Service — Forest Products Laboratory (LPF/SFB)
              </ExternalLinkRow>
              <ExternalLinkRow href={WOOD_DATABASE_URL}>The Wood Database</ExternalLinkRow>
              <ExternalLinkRow href={IPT_WOOD_URL}>
                São Paulo Institute for Technological Research (IPT)
              </ExternalLinkRow>
              <ExternalLinkRow href={OSU_DURABILITY_URL}>
                Oregon State University — Worldwide Natural Durability Checklist
              </ExternalLinkRow>
            </div>
          </section>

          <section className={styles.contact}>
            <h3>{copy.contact}</h3>
            <a className={styles.externalLink} href={`mailto:${CONTACT_EMAIL}`}>
              <span dir="ltr">{CONTACT_EMAIL}</span>
              <Mail size={16} aria-hidden="true" />
            </a>
          </section>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

function ExternalLinkRow({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className={styles.externalLink} href={href} target="_blank" rel="noreferrer">
      <span>{children}</span>
      <ExternalLink size={16} aria-hidden="true" />
    </a>
  );
}
