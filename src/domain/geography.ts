import type { ContinentCode, Origin } from '../types/wood';

export const CONTINENT_CODES: readonly ContinentCode[] = ['AF', 'AN', 'AS', 'EU', 'NA', 'OC', 'SA'];

const continentCodeSet = new Set<string>(CONTINENT_CODES);

export function isContinentCode(value: string): value is ContinentCode {
  return continentCodeSet.has(value);
}

export function normalizeContinentCodes(values: readonly string[]): ContinentCode[] {
  const normalized = new Set(
    values.map((value) => value.trim().toUpperCase()).filter(isContinentCode),
  );
  return CONTINENT_CODES.filter((code) => normalized.has(code));
}

export function isIsoAlpha2CountryCode(value: string): boolean {
  return /^[A-Z]{2}$/.test(value);
}

export function normalizeCountryCodes(values: readonly string[]): string[] {
  return [
    ...new Set(values.map((value) => value.trim().toUpperCase()).filter(isIsoAlpha2CountryCode)),
  ].sort();
}

export function originCodes(origin: Pick<Origin, 'continentCodes' | 'countryCodes'>): {
  continentCodes: ContinentCode[];
  countryCodes: string[];
} {
  return {
    continentCodes: normalizeContinentCodes(origin.continentCodes),
    countryCodes: normalizeCountryCodes(origin.countryCodes),
  };
}
