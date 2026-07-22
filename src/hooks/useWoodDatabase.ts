import { useEffect, useState } from 'react';
import {
  applyContentOverlay,
  isContentOverlayLanguage,
  validateContentOverlay,
} from '../domain/contentOverlay';
import { sourceLanguageFor } from '../i18n';
import type { AppLanguage, SourceLanguage, WoodDatabase } from '../types/wood';

const emptyDatabase = (language: SourceLanguage): WoodDatabase => ({
  language,
  generatedAt: '',
  source: {
    name: 'CIRAD Tropix',
    englishListing: 'https://tropix.cirad.fr/en/fiches-disponibles',
    frenchListing: 'https://tropix.cirad.fr/fiches-disponibles',
    englishSheets: 0,
    frenchSheets: 0,
  },
  records: [],
});

export function useWoodDatabase(language: AppLanguage) {
  const sourceLanguage = sourceLanguageFor(language);
  const [database, setDatabase] = useState<WoodDatabase>(() => emptyDatabase(sourceLanguage));
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    setDatabase(emptyDatabase(sourceLanguage));

    loadWoodDatabase(language, controller.signal)
      .then((nextDatabase) => {
        setDatabase(nextDatabase);
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setStatus('error');
      });

    return () => controller.abort();
  }, [language, sourceLanguage]);

  return { database, status };
}

async function loadWoodDatabase(language: AppLanguage, signal: AbortSignal) {
  const sourceLanguage = sourceLanguageFor(language);
  const databaseResponse = await fetch(publicUrl(`data/woods.generated.${sourceLanguage}.json`), {
    signal,
  });
  if (!databaseResponse.ok)
    throw new Error(`Wood database request failed: HTTP ${databaseResponse.status}`);
  const database = withPublicImageUrls((await databaseResponse.json()) as WoodDatabase);

  if (!isContentOverlayLanguage(language)) return database;

  const overlayResponse = await fetch(publicUrl(`data/content/${language}.json`), { signal });
  if (!overlayResponse.ok)
    throw new Error(`Content overlay request failed: HTTP ${overlayResponse.status}`);
  const overlay = validateContentOverlay(await overlayResponse.json(), {
    expectedLocale: language,
    expectedSourceGeneratedAt: database.generatedAt,
  });
  return applyContentOverlay(database, overlay);
}

function publicUrl(path: string) {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
}

function withPublicImageUrls(database: WoodDatabase): WoodDatabase {
  return {
    ...database,
    records: database.records.map((record) => ({
      ...record,
      images: record.images.map((image) => ({
        ...image,
        src: publicUrl(image.src),
      })),
    })),
  };
}
