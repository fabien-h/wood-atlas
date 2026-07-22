import { access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const host = '127.0.0.1';
const port = 4173;
const origin = `http://${host}:${port}`;
const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');
const chromePath = await findChrome();
const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({
  root,
  logLevel: 'silent',
  server: { host, port, strictPort: true },
});
await server.listen();
console.log('A11y server started.');

try {
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  try {
    const languagePage = await browser.newPage({ locale: 'fr-FR' });
    await blockImages(languagePage);
    await languagePage.goto(`${origin}/`);
    assert(
      new URL(languagePage.url()).searchParams.get('lang') === 'fr',
      'supported browser language was not added to the URL',
    );
    await languagePage.close();
    console.log('Browser language checked.');

    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      reducedMotion: 'reduce',
    });
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await blockImages(page);
    await page.goto(`${origin}/?lang=en`);
    await page.locator('tbody tr').first().waitFor();
    assert(
      new URL(page.url()).searchParams.size === 1,
      'the default view should only include its language in the URL',
    );
    assert(
      (await page.getByRole('dialog').count()) === 0,
      'the detail drawer should be closed by default',
    );
    await audit(page, 'default table');
    console.log('Default table checked.');

    const defaultSearch = page.getByRole('searchbox');
    const clearSearchButton = page.getByRole('button', { name: 'Clear search', exact: true });
    assert((await clearSearchButton.count()) === 0, 'clear search is visible for an empty query');
    await defaultSearch.fill('Chestnut');
    await clearSearchButton.waitFor();
    await clearSearchButton.click();
    assert((await defaultSearch.inputValue()) === '', 'clear search did not empty the query');
    assert((await clearSearchButton.count()) === 0, 'clear search remains visible after clearing');
    assert(
      await defaultSearch.evaluate((element) => element === document.activeElement),
      'focus was not restored to the search input after clearing',
    );
    console.log('Clear search checked.');

    await page.goto(`${origin}/?lang=en&q=Chestnut`);
    await page.getByRole('button', { name: 'Open details for Chestnut', exact: true }).waitFor();
    assert(
      (await page.getByText('Castanea Sativa', { exact: true }).count()) === 0,
      'the English table uses the Chestnut botanical name instead of its common name',
    );
    await page.goto(`${origin}/?lang=fr&q=Châtaignier`);
    await page
      .getByRole('button', { name: 'Ouvrir la fiche de Châtaignier', exact: true })
      .waitFor();
    assert(
      (await page.getByText('Castanea Sativa', { exact: true }).count()) === 0,
      'the French table uses the Chestnut botanical name instead of its common name',
    );
    console.log('Localized common names checked.');

    await page.goto(`${origin}/?lang=en&q=Scots%20Pine`);
    const scotsPineButton = page.getByRole('button', {
      name: 'Open details for Scots Pine',
      exact: true,
    });
    await scotsPineButton.waitFor();
    const scotsPineThumbnail = scotsPineButton.locator('[style*="background-image"]');
    assert(
      (await scotsPineThumbnail.count()) === 1 &&
        (await scotsPineThumbnail.getAttribute('style'))?.includes('/flat-sawn.jpg'),
      'the Scots Pine flat-sawn image is missing from its table thumbnail',
    );
    await scotsPineButton.click();
    const scotsPineDialog = page.getByRole('dialog');
    await scotsPineDialog.waitFor();
    assert(
      (await scotsPineDialog.locator('figure').count()) === 2,
      'Scots Pine does not have both manually sourced grain images',
    );
    assert(
      (await scotsPineDialog.locator('img[src*="/example-"]').count()) === 1,
      'the Scots Pine example image is missing from its dedicated section',
    );
    await page.getByRole('button', { name: 'Close detail' }).click();
    await scotsPineDialog.waitFor({ state: 'hidden' });
    console.log('Example image separation checked.');

    await page.goto(`${origin}/?lang=en&q=European%20Ash`);
    await page.getByRole('button', { name: 'Open details for European Ash', exact: true }).click();
    const europeanAshDialog = page.getByRole('dialog');
    await europeanAshDialog.waitFor();
    assert(
      (await europeanAshDialog.locator('figure').count()) === 2,
      'European Ash does not have both manually sourced grain images',
    );
    assert(
      (await europeanAshDialog.getByRole('link', { name: 'Beentree', exact: true }).count()) === 2,
      'European Ash image creator credits are missing',
    );
    assert(
      (await europeanAshDialog.getByRole('link', { name: 'CC BY-SA 4.0' }).count()) === 2,
      'European Ash image licence credits are missing',
    );
    await audit(page, 'manual image credits');
    await page.getByRole('button', { name: 'Close detail' }).click();
    await europeanAshDialog.waitFor({ state: 'hidden' });
    console.log('Manual image credits checked.');

    await page.goto(`${origin}/?lang=en`);
    await page.locator('tbody tr').first().waitFor();

    const aboutButton = page.getByRole('button', { name: 'About', exact: true });
    await aboutButton.click();
    const aboutDialog = page.getByRole('dialog', { name: 'About this atlas' });
    await aboutDialog.waitFor();
    assert(
      (await aboutDialog.getByRole('link', { name: /GitHub/ }).getAttribute('href')) ===
        'https://github.com/fabien-h/wood-atlas',
      'the About drawer has an incorrect GitHub repository URL',
    );
    assert(
      (await aboutDialog.getByRole('link', { name: /Tropix/ }).getAttribute('href')) ===
        'https://tropix.cirad.fr/',
      'the About drawer has an incorrect Tropix URL',
    );
    assert(
      (await aboutDialog.getByRole('link', { name: /BioWooEB/ }).getAttribute('href')) ===
        'https://ur-biowooeb.cirad.fr/',
      'the About drawer has an incorrect BioWooEB URL',
    );
    await audit(page, 'About drawer');
    await aboutDialog.getByRole('button', { name: 'Close About' }).click();
    await aboutDialog.waitFor({ state: 'hidden' });
    assert(
      await aboutButton.evaluate((element) => element === document.activeElement),
      'focus was not restored to the About button',
    );
    console.log('About drawer checked.');

    await page.goto(
      `${origin}/?lang=en&q=abura&region=Africa&filters=open&sort=density&direction=desc&compare=africa-abura&compare=america-abiurana-vermelha`,
    );
    await page.locator('tbody tr').first().waitFor();
    const stateBeforeLanguageChange = urlStateWithoutLanguage(page.url());
    await page.locator('header select').selectOption('fr');
    await page.waitForFunction(() => new URL(location.href).searchParams.get('lang') === 'fr');
    assert(
      urlStateWithoutLanguage(page.url()) === stateBeforeLanguageChange,
      'changing language discarded other URL state',
    );
    await page.locator('header select').selectOption('en');
    await page.waitForFunction(() => new URL(location.href).searchParams.get('lang') === 'en');
    assert(
      urlStateWithoutLanguage(page.url()) === stateBeforeLanguageChange,
      'changing language back discarded other URL state',
    );
    console.log('Language URL preservation checked.');

    await page.goto(`${origin}/?lang=en`);
    await page.locator('tbody tr').first().waitFor();

    const densityHeader = page.locator('thead th').nth(3);
    await densityHeader.getByRole('button').click();
    assert(
      (await densityHeader.getAttribute('aria-sort')) === 'ascending',
      'first sort click did not sort ascending',
    );
    await densityHeader.getByRole('button').click();
    assert(
      (await densityHeader.getAttribute('aria-sort')) === 'descending',
      'second sort click did not sort descending',
    );
    await densityHeader.getByRole('button').click();
    assert(
      (await densityHeader.getAttribute('aria-sort')) === 'none',
      'third sort click did not clear sorting',
    );
    assert(!new URL(page.url()).searchParams.has('sort'), 'cleared sorting remains in the URL');

    await page.getByRole('searchbox').fill('a');
    await page.getByRole('button', { name: 'Show filters' }).click();
    const filterPanel = page.locator('#filter-panel');
    const filterScroller = filterPanel.locator(':scope > div');
    const filterHeader = filterPanel.locator(':scope > header');
    const clearFiltersButton = page.getByRole('button', { name: 'Clear filters', exact: true });
    const filterHeaderBeforeScroll = await filterHeader.boundingBox();
    const clearButtonBeforeScroll = await clearFiltersButton.boundingBox();
    const filterPanelBox = await filterPanel.boundingBox();
    assert(
      filterHeaderBeforeScroll && clearButtonBeforeScroll && filterPanelBox,
      'filter panel header and footer could not be measured',
    );
    assert(
      Math.abs(
        clearButtonBeforeScroll.y +
          clearButtonBeforeScroll.height -
          (filterPanelBox.y + filterPanelBox.height),
      ) < 1,
      'clear filters is not anchored to the bottom of the filter panel',
    );
    await filterScroller.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    const filterHeaderAfterScroll = await filterHeader.boundingBox();
    const clearButtonAfterScroll = await clearFiltersButton.boundingBox();
    assert(
      clearButtonAfterScroll && Math.abs(clearButtonAfterScroll.y - clearButtonBeforeScroll.y) < 1,
      'clear filters moved when the filter list scrolled',
    );
    assert(
      filterHeaderAfterScroll &&
        Math.abs(filterHeaderAfterScroll.y - filterHeaderBeforeScroll.y) < 1,
      'filter header moved when the filter list scrolled',
    );
    await audit(page, 'open filters');
    console.log('Filters checked.');

    const compareButtons = page.locator('tbody button[aria-pressed]');
    await compareButtons.nth(0).click();
    await compareButtons.nth(1).click();
    await page.getByRole('heading', { name: /Comparison \(2\)/ }).waitFor();
    await audit(page, 'comparison');
    console.log('Comparison checked.');

    const firstDetailButton = page.locator('tbody button[aria-label^="Open details for"]').first();
    await firstDetailButton.click();
    await page.getByRole('dialog').waitFor();
    await audit(page, 'detail drawer');
    console.log('Detail checked.');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.getByRole('button', { name: 'Close detail' }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.waitForTimeout(350);
    const detailOverlay = page.getByTestId('detail-overlay');
    if (await detailOverlay.count()) {
      const overlayState = await detailOverlay.evaluate((element) => {
        const style = getComputedStyle(element);
        return { opacity: style.opacity, pointerEvents: style.pointerEvents };
      });
      assert(
        overlayState.opacity === '0',
        `closed detail overlay is still visible (opacity: ${overlayState.opacity})`,
      );
      assert(
        overlayState.pointerEvents === 'none',
        `closed detail overlay still intercepts pointer events (${overlayState.pointerEvents})`,
      );
    }
    assert(
      (await page.locator(':focus').getAttribute('aria-label'))?.startsWith('Open details for'),
      'focus was not restored to the detail trigger',
    );
    await page.getByRole('searchbox').click();
    console.log('Detail lifecycle and focus checked.');

    await page.goto(`${origin}/?lang=fr`);
    const search = page.getByRole('searchbox');
    await search.fill('chene');
    await page.getByText('Chêne', { exact: true }).first().waitFor();
    await page.getByRole('button', { name: 'Afficher les filtres' }).click();
    await page.getByRole('button', { name: 'Tempéré', exact: true }).click();
    await page.locator('tbody button[aria-label^="Ouvrir la fiche de"]').first().click();
    const persistedUrl = new URL(page.url());
    assert(persistedUrl.searchParams.get('lang') === 'fr', 'language is missing from the URL');
    assert(persistedUrl.searchParams.get('q') === 'chene', 'search is missing from the URL');
    assert(
      persistedUrl.searchParams.getAll('region').includes('Temperate'),
      'filter is missing from the URL',
    );
    assert(Boolean(persistedUrl.searchParams.get('wood')), 'open detail is missing from the URL');
    await page.reload();
    await page.getByRole('dialog').waitFor();
    assert((await search.inputValue()) === 'chene', 'search was not restored after reload');
    console.log('Reload persistence checked.');

    await page.goBack();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    console.log('History checked.');
    await page.goForward();
    await page.getByRole('dialog').waitFor();
    await page.goBack();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });

    await page.setViewportSize({ width: 700, height: 800 });
    await audit(page, 'mobile filter drawer');
    console.log('Mobile checked.');
    assert(
      pageErrors.length === 0,
      `the browser reported runtime errors:\n${pageErrors.join('\n')}`,
    );
  } finally {
    await browser.close();
  }
  console.log('Accessibility and URL navigation checks passed.');
} finally {
  await server.close();
}

async function audit(page, label) {
  await page.addScriptTag({ path: axePath });
  const result = await page.evaluate(async () =>
    globalThis.axe.run(document, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'],
      },
    }),
  );
  if (result.violations.length === 0) return;
  const details = result.violations
    .map((violation) => {
      const targets = violation.nodes
        .map((node) => `    ${node.target.join(' ')}\n      ${node.failureSummary ?? ''}`)
        .join('\n');
      return `  ${violation.id}: ${violation.help}\n${targets}`;
    })
    .join('\n');
  throw new Error(
    `${label} has ${result.violations.length} accessibility violation(s):\n${details}`,
  );
}

async function findChrome() {
  const configured = process.env.CHROME_PATH;
  const candidates = [
    configured,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next common Chrome installation path.
    }
  }
  throw new Error('Chrome was not found. Set CHROME_PATH to run accessibility tests.');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function urlStateWithoutLanguage(value) {
  const url = new URL(value);
  return JSON.stringify(
    [...url.searchParams.entries()]
      .filter(([key]) => key !== 'lang')
      .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
        leftKey === rightKey
          ? leftValue.localeCompare(rightValue)
          : leftKey.localeCompare(rightKey),
      ),
  );
}

async function blockImages(page) {
  await page.route('**/*', (route) => {
    if (route.request().resourceType() === 'image') return route.abort();
    return route.continue();
  });
}
