#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const terminologyPath = path.join(projectRoot, 'data/i18n/terminology.json');
const manifestPath = path.join(projectRoot, 'data/i18n/source.en.json');
const translationsDirectory = path.join(projectRoot, 'data/i18n/translations');
const arguments_ = new Set(process.argv.slice(2));
const jsonOutput = arguments_.has('--json');
const requestedLocales = process.argv
  .slice(2)
  .filter((argument) => argument.startsWith('--locale='))
  .flatMap((argument) => argument.slice('--locale='.length).split(','))
  .map((locale) => locale.trim())
  .filter(Boolean);

const terminology = readJson(terminologyPath, true);
const tokenRules = compileTokenRules(terminology.protectedContent);
const report = {
  schemaVersion: 1,
  terminology: auditTerminology(terminology),
  sourceDatabases: auditSourceDatabases(terminology),
  manifest: null,
  locales: {},
  summary: {
    auditedLocales: 0,
    missingTranslations: 0,
    untranslatedLeakage: 0,
    changedProtectedTokens: 0,
    scriptMismatches: 0,
    errors: 0,
  },
};

const manifest = readJson(manifestPath, false);
if (manifest) {
  report.manifest = auditManifest(manifest);
  const locales =
    requestedLocales.length > 0
      ? requestedLocales
      : [
          ...new Set([
            ...discoverLocales(translationsDirectory),
            ...Object.keys(terminology.scriptPolicies ?? {}),
          ]),
        ].sort();
  for (const locale of locales) {
    const catalogPath = path.join(translationsDirectory, `${locale}.json`);
    const catalog = readJson(catalogPath, false);
    report.locales[locale] = catalog
      ? auditCatalog(locale, catalog, manifest, terminology)
      : { status: 'missing-catalog', path: relative(catalogPath) };
  }
} else {
  report.manifest = { status: 'not-found', path: relative(manifestPath) };
}

for (const localeReport of Object.values(report.locales)) {
  if (localeReport.status !== 'audited') continue;
  report.summary.auditedLocales += 1;
  report.summary.missingTranslations += localeReport.summary.missing;
  report.summary.untranslatedLeakage += localeReport.summary.untranslatedLeakage;
  report.summary.changedProtectedTokens += localeReport.summary.changedProtectedTokens;
  report.summary.scriptMismatches += localeReport.summary.scriptMismatches;
  report.summary.errors += localeReport.summary.errors;
}

if (jsonOutput) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  printReport(report);
}

if (
  report.summary.auditedLocales > 0 &&
  (report.summary.missingTranslations > 0 ||
    report.summary.changedProtectedTokens > 0 ||
    report.summary.scriptMismatches > 0 ||
    report.summary.errors > 0)
) {
  process.exitCode = 1;
}

function readJson(filePath, required) {
  if (!fs.existsSync(filePath)) {
    if (required) throw new Error(`Required file not found: ${filePath}`);
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function relative(filePath) {
  return path.relative(projectRoot, filePath);
}

function auditTerminology(config) {
  const issues = [];
  const identifiers = new Set();
  let entries = 0;
  for (const [scope, definition] of Object.entries(config.scopes ?? {})) {
    if (!Array.isArray(definition.paths) || definition.paths.length === 0) {
      issues.push({ kind: 'scope-without-path', scope });
    }
    const english = new Set();
    for (const entry of definition.entries ?? []) {
      entries += 1;
      if (!entry.id || !entry.en || !entry.fr)
        issues.push({ kind: 'incomplete-entry', scope, id: entry.id ?? null });
      if (identifiers.has(entry.id)) issues.push({ kind: 'duplicate-id', scope, id: entry.id });
      if (english.has(normalizeText(entry.en)))
        issues.push({ kind: 'duplicate-english', scope, value: entry.en });
      identifiers.add(entry.id);
      english.add(normalizeText(entry.en));
    }
  }
  return {
    path: relative(terminologyPath),
    scopes: Object.keys(config.scopes ?? {}).length,
    entries,
    protectedPathPatterns: config.protectedContent?.exactPathPatterns?.length ?? 0,
    protectedTokenRules: tokenRules.length,
    issues,
  };
}

function auditSourceDatabases(config) {
  const englishPath = path.join(projectRoot, config.sourceDatabases.en);
  const frenchPath = path.join(projectRoot, config.sourceDatabases.fr);
  const english = readJson(englishPath, false);
  const french = readJson(frenchPath, false);
  if (!english || !french) {
    return {
      status: 'not-found',
      en: relative(englishPath),
      fr: relative(frenchPath),
    };
  }

  const frenchById = new Map(french.records.map((record) => [record.id, record]));
  const sharedRecords = english.records.filter((record) => frenchById.has(record.id));
  const scopeCoverage = {};
  const protectedTokenIssues = [];
  for (const [scope, definition] of Object.entries(config.scopes)) {
    const englishValues = collectDatabaseValues(sharedRecords, definition.paths);
    const frenchValues = collectDatabaseValues(
      sharedRecords.map((record) => frenchById.get(record.id)),
      definition.paths,
    );
    const englishTerms = new Set(definition.entries.map((entry) => normalizeText(entry.en)));
    const frenchTerms = new Set(
      definition.entries.map((entry) =>
        normalizeText(definition.sourceValueLanguage === 'en' ? entry.en : entry.fr),
      ),
    );
    const codeScope = definition.translate === false;
    const englishMatched = codeScope
      ? definition.entries.filter((entry) =>
          [...englishValues].some((value) => includesTerm(value, entry.en)),
        ).length
      : [...englishValues].filter((value) => englishTerms.has(normalizeText(value))).length;
    const frenchMatched = codeScope
      ? definition.entries.filter((entry) =>
          [...frenchValues].some((value) =>
            includesTerm(value, definition.sourceValueLanguage === 'en' ? entry.en : entry.fr),
          ),
        ).length
      : [...frenchValues].filter((value) => frenchTerms.has(normalizeText(value))).length;
    scopeCoverage[scope] = {
      glossaryEntries: definition.entries.length,
      englishObserved: englishValues.size,
      englishMatched,
      frenchObserved: frenchValues.size,
      frenchMatched,
    };

    for (const englishRecord of sharedRecords) {
      const frenchRecord = frenchById.get(englishRecord.id);
      const englishText = definition.paths
        .flatMap((valuePath) => valuesAtPath(englishRecord, valuePath))
        .filter((value) => typeof value === 'string')
        .sort()
        .join('\n');
      const frenchText = definition.paths
        .flatMap((valuePath) => valuesAtPath(frenchRecord, valuePath))
        .filter((value) => typeof value === 'string')
        .sort()
        .join('\n');
      if (!englishText || !frenchText) continue;
      const changes = compareProtectedTokens(englishText, frenchText);
      if (changes.length > 0)
        protectedTokenIssues.push({ woodId: englishRecord.id, scope, changes });
    }
  }

  const botanicalIssues = [];
  for (const englishRecord of sharedRecords) {
    const frenchRecord = frenchById.get(englishRecord.id);
    const englishNames = englishRecord.identity.botanicalNames.map((item) => item.name);
    const frenchNames = frenchRecord.identity.botanicalNames.map((item) => item.name);
    if (!sameMultiset(englishNames.map(normalizeText), frenchNames.map(normalizeText))) {
      botanicalIssues.push({
        woodId: englishRecord.id,
        en: englishNames,
        fr: frenchNames,
      });
    }
  }

  const protectedTokenMismatchRules = {};
  for (const issue of protectedTokenIssues)
    for (const change of issue.changes) {
      protectedTokenMismatchRules[change.rule] =
        (protectedTokenMismatchRules[change.rule] ?? 0) + 1;
    }

  return {
    status: 'audited',
    en: relative(englishPath),
    fr: relative(frenchPath),
    englishRecords: english.records.length,
    frenchRecords: french.records.length,
    sharedRecords: sharedRecords.length,
    botanicalNameMismatches: botanicalIssues.length,
    botanicalIssues: botanicalIssues.slice(0, 25),
    protectedTokenMismatches: protectedTokenIssues.length,
    protectedTokenMismatchRules,
    protectedTokenIssues: protectedTokenIssues.slice(0, 25),
    scopeCoverage,
  };
}

function auditManifest(manifest) {
  const issues = [];
  const identifiers = new Set();
  const scopeCounts = {};
  for (const unit of manifest.units ?? []) {
    if (!unit.id || typeof unit.source !== 'string' || !unit.scope)
      issues.push({ kind: 'invalid-unit', id: unit.id ?? null });
    if (identifiers.has(unit.id)) issues.push({ kind: 'duplicate-unit-id', id: unit.id });
    identifiers.add(unit.id);
    scopeCounts[unit.scope] = (scopeCounts[unit.scope] ?? 0) + 1;
  }
  return {
    status: 'audited',
    path: relative(manifestPath),
    schemaVersion: manifest.schemaVersion,
    manifestHash: manifest.manifestHash,
    units: manifest.units?.length ?? 0,
    scopeCounts,
    issues,
  };
}

function auditCatalog(locale, catalog, manifest, config) {
  const issues = [];
  const translations =
    catalog.translations && typeof catalog.translations === 'object' ? catalog.translations : {};
  const unitsById = new Map((manifest.units ?? []).map((unit) => [unit.id, unit]));
  const perScope = {};
  const summary = {
    total: manifest.units?.length ?? 0,
    complete: 0,
    missing: 0,
    untranslatedLeakage: 0,
    changedProtectedTokens: 0,
    scriptMismatches: 0,
    errors: 0,
  };

  if (catalog.schemaVersion !== 1)
    issues.push({ kind: 'catalog-schema-version', expected: 1, actual: catalog.schemaVersion });
  if (catalog.locale !== locale)
    issues.push({ kind: 'catalog-locale', expected: locale, actual: catalog.locale });
  if (catalog.sourceLanguage !== 'en')
    issues.push({ kind: 'source-language', expected: 'en', actual: catalog.sourceLanguage });
  if (catalog.sourceManifestHash !== manifest.manifestHash) {
    issues.push({
      kind: 'stale-manifest-hash',
      expected: manifest.manifestHash,
      actual: catalog.sourceManifestHash,
    });
  }

  for (const unit of manifest.units ?? []) {
    const scope = unit.scope || 'unknown';
    const scopeReport = (perScope[scope] ??= { total: 0, complete: 0, missing: 0, percent: 0 });
    scopeReport.total += 1;
    const target = translations[unit.id];
    if (typeof target !== 'string' || !target.trim()) {
      summary.missing += 1;
      scopeReport.missing += 1;
      issues.push({ kind: 'missing-translation', id: unit.id, scope });
      continue;
    }
    summary.complete += 1;
    scopeReport.complete += 1;
    const contextPaths = (unit.contexts ?? []).map((context) => context.path).filter(Boolean);
    const protectedPath = contextPaths.some((contextPath) =>
      config.protectedContent.exactPathPatterns.some((pattern) =>
        pathMatches(contextPath, pattern),
      ),
    );
    if (protectedPath && target !== unit.source) {
      summary.errors += 1;
      issues.push({
        kind: 'protected-path-changed',
        id: unit.id,
        scope,
        paths: contextPaths,
        source: unit.source,
        target,
      });
    }

    const tokenChanges = compareProtectedTokens(unit.source, target);
    const declaredTokenChanges = compareDeclaredTokens(unit.protectedTokens ?? [], target);
    if (declaredTokenChanges.length > 0)
      tokenChanges.push({
        rule: 'manifest-protectedTokens',
        source: declaredTokenChanges,
        target: [],
      });
    if (tokenChanges.length > 0) {
      summary.changedProtectedTokens += 1;
      issues.push({
        kind: 'changed-protected-token',
        id: unit.id,
        scope,
        changes: tokenChanges,
        source: unit.source,
        target,
      });
    }

    const scopeDefinition = definitionForManifestScope(config, scope);
    const unchangedAllowed =
      protectedPath ||
      scopeDefinition?.translate === false ||
      containsOnlyProtectedContent(unit.source);
    if (normalizeText(target) === normalizeText(unit.source) && !unchangedAllowed) {
      summary.untranslatedLeakage += 1;
      issues.push({ kind: 'untranslated-leakage', id: unit.id, scope, source: unit.source });
    }

    const scriptPolicy = config.scriptPolicies[locale];
    if (scriptPolicy && !protectedPath) {
      const unexpected = unexpectedScriptWords(target, scriptPolicy);
      if (unexpected.length > 0) {
        summary.scriptMismatches += 1;
        issues.push({ kind: 'script-mismatch', id: unit.id, scope, unexpected, target });
      }
    }
  }

  for (const scopeReport of Object.values(perScope)) {
    scopeReport.percent =
      scopeReport.total === 0
        ? 100
        : Number(((scopeReport.complete / scopeReport.total) * 100).toFixed(1));
  }
  const unknownIds = Object.keys(translations).filter((id) => !unitsById.has(id));
  if (unknownIds.length > 0) issues.push({ kind: 'unknown-translation-ids', ids: unknownIds });
  return {
    status: 'audited',
    path: relative(path.join(translationsDirectory, `${locale}.json`)),
    summary,
    perScope,
    issues,
  };
}

function compileTokenRules(protectedContent) {
  const rules = (protectedContent.tokenPatterns ?? []).map((rule) => ({
    ...rule,
    regex: new RegExp(rule.pattern, rule.flags.includes('g') ? rule.flags : `${rule.flags}g`),
  }));
  for (const unit of protectedContent.units ?? []) {
    rules.push({ id: `unit:${unit}`, comparison: 'exact', regex: literalRegex(unit) });
  }
  for (const token of protectedContent.literalTokens ?? []) {
    rules.push({
      id: `literal:${token}`,
      comparison: 'case-insensitive',
      regex: literalRegex(token, 'giu'),
    });
  }
  return rules;
}

function literalRegex(value, flags = 'gu') {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const startsWithWord = /^[\p{L}\p{N}]/u.test(value);
  const endsWithWord = /[\p{L}\p{N}]$/u.test(value);
  return new RegExp(
    `${startsWithWord ? '(?<![\\p{L}\\p{N}])' : ''}${escaped}${endsWithWord ? '(?![\\p{L}\\p{N}])' : ''}`,
    flags,
  );
}

function compareProtectedTokens(source, target) {
  const changes = [];
  for (const rule of tokenRules) {
    const sourceTokens = extractTokens(source, rule);
    const targetTokens = extractTokens(target, rule);
    if (!sameMultiset(sourceTokens, targetTokens)) {
      changes.push({ rule: rule.id, source: sourceTokens, target: targetTokens });
    }
  }
  return changes;
}

function compareDeclaredTokens(tokens, target) {
  const targetNumbers = extractTokens(
    target,
    tokenRules.find((rule) => rule.id === 'number'),
  );
  return tokens.filter((token) => {
    if (/^[\p{Nd}+−-]/u.test(token)) {
      return !targetNumbers.includes(normalizeToken(token, 'numeric-equivalent'));
    }
    return !String(target).includes(token);
  });
}

function extractTokens(value, rule) {
  rule.regex.lastIndex = 0;
  return [...String(value).matchAll(rule.regex)]
    .map((match) => normalizeToken(match[0], rule.comparison))
    .sort();
}

function normalizeToken(value, comparison) {
  if (comparison === 'case-insensitive') return value.toLocaleLowerCase('en');
  if (comparison === 'numeric-equivalent') {
    return translateDigits(value)
      .replace(/[.,٫]/g, '.')
      .replace(/(?:to|à)/giu, '-')
      .replace(/[–—−]/g, '-')
      .replace(/\s+/g, '');
  }
  if (comparison === 'space-punctuation-normalized' || comparison === 'punctuation-normalized') {
    return value.toLocaleUpperCase('en').replace(/[\s.,-]+/g, '');
  }
  return value;
}

function translateDigits(value) {
  const ranges = [
    [0x30, 0x39, 0x30],
    [0x660, 0x669, 0x660],
    [0x6f0, 0x6f9, 0x6f0],
    [0x966, 0x96f, 0x966],
    [0x9e6, 0x9ef, 0x9e6],
  ];
  return [...value]
    .map((character) => {
      const codePoint = character.codePointAt(0);
      const range = ranges.find(([start, end]) => codePoint >= start && codePoint <= end);
      return range ? String(codePoint - range[2]) : character;
    })
    .join('');
}

function containsOnlyProtectedContent(value) {
  let remainder = String(value);
  for (const rule of tokenRules) {
    rule.regex.lastIndex = 0;
    remainder = remainder.replace(rule.regex, ' ');
  }
  return !/[\p{L}\p{N}]/u.test(remainder);
}

function unexpectedScriptWords(value, policy) {
  let remainder = String(value);
  for (const rule of tokenRules) {
    rule.regex.lastIndex = 0;
    remainder = remainder.replace(rule.regex, ' ');
  }
  const allowed = new RegExp(
    `^[${policy.scripts.map((script) => `\\p{Script=${script}}`).join('')}\\p{Mark}]+$`,
    'u',
  );
  return [...new Set(remainder.match(/[\p{L}\p{Mark}]+/gu) ?? [])]
    .filter((word) => !allowed.test(word))
    .slice(0, 12);
}

function pathMatches(actualPath, configuredPattern) {
  const normalizePath = (value) =>
    value.replace(/^records(?:\[\d+\]|\.[^.]+)\.?/, '').replace(/\[\d+\]/g, '[]');
  const actual = normalizePath(actualPath);
  const pattern = normalizePath(configuredPattern);
  const regex = new RegExp(
    `^${pattern
      .split('*')
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('[^.\\[\\]]+')}$`,
  );
  return regex.test(actual);
}

function collectDatabaseValues(records, paths) {
  const result = new Set();
  for (const record of records)
    for (const valuePath of paths) {
      for (const value of valuesAtPath(record, valuePath)) {
        if (typeof value === 'string' && value.trim())
          result.add(value.trim().replace(/\s+/g, ' '));
      }
    }
  return result;
}

function definitionForManifestScope(config, manifestScope) {
  return Object.values(config.scopes).find(
    (definition) =>
      definition.paths?.includes(manifestScope) ||
      definition.manifestScopes?.includes(manifestScope),
  );
}

function valuesAtPath(value, valuePath) {
  const segments = valuePath.split('.');
  let current = [value];
  for (const segment of segments) {
    const array = segment.endsWith('[]');
    const property = array ? segment.slice(0, -2) : segment;
    current = current.flatMap((item) => {
      const next = item?.[property];
      if (array) return Array.isArray(next) ? next : [];
      return next === undefined || next === null ? [] : [next];
    });
  }
  return current;
}

function includesTerm(value, term) {
  return normalizeText(value).includes(normalizeText(term));
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('en');
}

function sameMultiset(left, right) {
  if (left.length !== right.length) return false;
  const counts = new Map();
  for (const item of left) counts.set(item, (counts.get(item) ?? 0) + 1);
  for (const item of right) {
    const count = counts.get(item) ?? 0;
    if (count === 0) return false;
    counts.set(item, count - 1);
  }
  return [...counts.values()].every((count) => count === 0);
}

function discoverLocales(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory)
    .filter((fileName) => fileName.endsWith('.json'))
    .map((fileName) => fileName.slice(0, -'.json'.length))
    .sort();
}

function printReport(result) {
  console.log('Content translation audit');
  console.log(
    `Terminology: ${result.terminology.scopes} scopes, ${result.terminology.entries} EN/FR pairs, ${result.terminology.issues.length} issue(s)`,
  );
  if (result.sourceDatabases.status === 'audited') {
    console.log(
      `Source databases: ${result.sourceDatabases.englishRecords} EN, ${result.sourceDatabases.frenchRecords} FR, ${result.sourceDatabases.sharedRecords} paired records`,
    );
    console.log(`Botanical-name mismatches: ${result.sourceDatabases.botanicalNameMismatches}`);
    console.log(
      `Protected numeric/code-token mismatches in EN/FR controlled fields: ${result.sourceDatabases.protectedTokenMismatches}`,
    );
    if (result.sourceDatabases.protectedTokenMismatches > 0) {
      console.log(
        `  by rule: ${Object.entries(result.sourceDatabases.protectedTokenMismatchRules)
          .map(([rule, count]) => `${rule}=${count}`)
          .join(', ')}`,
      );
    }
    for (const [scope, coverage] of Object.entries(result.sourceDatabases.scopeCoverage)) {
      console.log(
        `  ${scope}: glossary ${coverage.glossaryEntries}; observed/matched EN ${coverage.englishObserved}/${coverage.englishMatched}, FR ${coverage.frenchObserved}/${coverage.frenchMatched}`,
      );
    }
  } else {
    console.log('Source databases: unavailable');
  }
  if (result.manifest.status === 'not-found') {
    console.log(`Manifest: not found (${result.manifest.path}); locale-catalog audit skipped`);
  } else {
    console.log(
      `Manifest: ${result.manifest.units} units in ${Object.keys(result.manifest.scopeCounts).length} scopes`,
    );
  }
  for (const [locale, localeReport] of Object.entries(result.locales)) {
    if (localeReport.status !== 'audited') {
      console.log(`${locale}: ${localeReport.status}`);
      continue;
    }
    const summary = localeReport.summary;
    console.log(
      `${locale}: ${summary.complete}/${summary.total} complete; missing ${summary.missing}; unchanged ${summary.untranslatedLeakage}; protected-token changes ${summary.changedProtectedTokens}; script mismatches ${summary.scriptMismatches}; errors ${summary.errors}`,
    );
    for (const [scope, coverage] of Object.entries(localeReport.perScope)) {
      console.log(`  ${scope}: ${coverage.complete}/${coverage.total} (${coverage.percent}%)`);
    }
    for (const issue of localeReport.issues.slice(0, 30))
      console.log(`  ! ${issue.kind}: ${issue.id ?? ''}`.trimEnd());
    if (localeReport.issues.length > 30)
      console.log(
        `  … ${localeReport.issues.length - 30} additional issue(s); use --json for the full report`,
      );
  }
}
