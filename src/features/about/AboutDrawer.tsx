import { ExternalLink, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import type { Translation } from '../../i18n';
import styles from './AboutDrawer.module.css';

const GITHUB_REPOSITORY_URL = 'https://github.com/fabien-h/wood-atlas';
const TROPIX_URL = 'https://tropix.cirad.fr/';
const BIOWOOEB_URL = 'https://ur-biowooeb.cirad.fr/';

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
            </div>
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
