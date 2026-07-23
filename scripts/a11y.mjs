import { access, readFile } from 'node:fs/promises';
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
const publishedCoverage = await auditPublishedLpfMeasurements();
await auditPublishedLignumdataMeasurements();
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
    for (const [columnIndex, expected, label] of [
      [3, publishedCoverage.naturalUseClass, 'natural-use classes'],
      [4, publishedCoverage.fungi, 'fungal-durability classes'],
      [5, publishedCoverage.termites, 'termite-resistance classes'],
      [6, publishedCoverage.treatability, 'treatability classes'],
      [7, publishedCoverage.hardness, 'hardness values'],
      [8, publishedCoverage.density, 'density values'],
      [9, publishedCoverage.radialShrinkage, 'radial-shrinkage values'],
      [10, publishedCoverage.tangentialShrinkage, 'tangential-shrinkage values'],
      [11, publishedCoverage.modulus, 'elasticity values'],
    ]) {
      const displayed = await countNonMissingCells(page, columnIndex);
      assert(
        displayed === expected,
        `the main table displayed ${displayed}/${expected} published ${label}`,
      );
    }
    console.log('Published main-table coverage checked.');
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
    await page
      .getByRole('button', { name: 'Open details for Sweet chestnut', exact: true })
      .waitFor();
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

    await page.goto(`${origin}/?lang=en&q=maple`);
    await page
      .getByRole('button', { name: 'Open details for Sycamore (Maple)', exact: true })
      .waitFor();
    await page.goto(`${origin}/?lang=en&q=oak`);
    await page.getByRole('button', { name: 'Open details for White oak', exact: true }).waitFor();
    await page.goto(`${origin}/?lang=de&q=Bergahorn`);
    await page.getByText('Bergahorn', { exact: true }).waitFor();
    await page.goto(`${origin}/?lang=zh-Hans&q=欧洲枫木`);
    await page.getByText('假悬铃木槭（欧洲枫木）', { exact: true }).waitFor();
    await page.goto(`${origin}/?lang=de&q=Afrikanisches%20Ebenholz`);
    await page.getByText('African Ebony', { exact: true }).waitFor();
    console.log('Localized common names checked.');

    for (const [woodName, expectedDensity] of [
      ['Honeylocust', '0.75'],
      ['Sweetbay', '0.47'],
      ['Tanoak', '0.66'],
    ]) {
      await page.goto(`${origin}/?lang=en&q=${encodeURIComponent(woodName)}`);
      const row = page
        .getByRole('button', { name: `Open details for ${woodName}`, exact: true })
        .locator('xpath=ancestor::tr');
      await row.waitFor();
      assert(
        (await row.locator('td').nth(8).innerText()) === expectedDensity,
        `${woodName} has a nonnumeric density value in the main table`,
      );
    }
    console.log('Manual density values checked.');

    await page.goto(`${origin}/?lang=en&q=Abacatirana`);
    const abacatiranaRow = page
      .getByRole('button', { name: 'Open details for Abacatirana', exact: true })
      .locator('xpath=ancestor::tr');
    await abacatiranaRow.waitFor();
    const abacatiranaCells = await abacatiranaRow.locator('td').allTextContents();
    assert(
      abacatiranaCells[7].trim() === '4,560.1 N',
      `the main table hid Abacatirana's LPF Janka hardness: ${abacatiranaCells[7]}`,
    );
    assert(
      abacatiranaCells[8].trim() === '0.62' &&
        abacatiranaCells[9].trim() === '3.94 %' &&
        abacatiranaCells[10].trim() === '6.59 %' &&
        abacatiranaCells[11].trim() === '9,900',
      `the main table hid Abacatirana's LPF physical data: ${JSON.stringify(abacatiranaCells.slice(8, 12))}`,
    );
    assert(
      (await abacatiranaRow.locator('td').nth(7).getAttribute('title')) === 'Janka hardness',
      'the main table does not identify the displayed hardness scale',
    );
    console.log('LPF measurements in the main table checked.');

    await page.goto(`${origin}/?lang=en&q=Northern%20red%20oak`);
    const northernRedOakRow = page
      .getByRole('button', { name: 'Open details for Northern red oak', exact: true })
      .locator('xpath=ancestor::tr');
    await northernRedOakRow.waitFor();
    const northernRedOakCells = await northernRedOakRow.locator('td').allTextContents();
    assert(
      northernRedOakCells[3].trim() === 'Class 2' &&
        northernRedOakCells[4].trim() === 'Class 3–4' &&
        northernRedOakCells[5].trim() === 'Class S' &&
        northernRedOakCells[6].trim() === 'Class 2–3',
      `the main table is missing Northern red oak durability data: ${JSON.stringify(northernRedOakCells.slice(3, 7))}`,
    );
    await northernRedOakRow
      .getByRole('button', { name: 'Open details for Northern red oak', exact: true })
      .click();
    const northernRedOakDialog = page.getByRole('dialog');
    await northernRedOakDialog.waitFor();
    await northernRedOakDialog
      .getByRole('link', { name: /Quercus rubra — Lignumdata factual data/ })
      .waitFor();
    await northernRedOakDialog
      .getByRole('link', { name: /Nouveau à la gamme : le chêne rouge/ })
      .waitFor();
    await page.getByRole('button', { name: 'Close detail' }).click();
    await northernRedOakDialog.waitFor({ state: 'hidden' });
    console.log('Northern red oak durability and provenance checked.');

    await page.goto(`${origin}/?lang=en&q=Loblolly%20Pine`);
    const loblollyPineRow = page
      .getByRole('button', { name: 'Open details for Loblolly Pine', exact: true })
      .locator('xpath=ancestor::tr');
    await loblollyPineRow.waitFor();
    assert(
      (await loblollyPineRow.locator('td').nth(5).innerText()).trim() === 'Class S',
      'the main table is missing Loblolly Pine termite resistance',
    );
    await loblollyPineRow
      .getByRole('button', { name: 'Open details for Loblolly Pine', exact: true })
      .click();
    const loblollyPineDialog = page.getByRole('dialog');
    await loblollyPineDialog.waitFor();
    assert(
      (
        await loblollyPineDialog
          .getByText('Dry wood borers', { exact: true })
          .locator('xpath=following-sibling::dd')
          .innerText()
      ).trim() === 'class d - durable',
      'the detail drawer is missing Loblolly Pine dry-wood-borer resistance',
    );
    assert(
      (
        await loblollyPineDialog
          .getByText('Sapwood treatability', { exact: true })
          .locator('xpath=following-sibling::dd')
          .innerText()
      ).trim() === 'class 1 - easily permeable',
      'the detail drawer is missing Loblolly Pine sapwood treatability',
    );
    await loblollyPineDialog
      .getByRole('link', { name: /Pinus taeda — Lignumdata factual data/ })
      .waitFor();
    await page.getByRole('button', { name: 'Close detail' }).click();
    await loblollyPineDialog.waitFor({ state: 'hidden' });
    console.log('Additional Lignumdata durability and provenance checked.');

    await page.goto(`${origin}/?lang=en&q=Scots%20Pine`);
    const scotsPineButton = page.getByRole('button', {
      name: 'Open details for Scots Pine',
      exact: true,
    });
    await scotsPineButton.waitFor();
    const scotsPineThumbnail = scotsPineButton.locator('[style*="background-image"]');
    assert(
      (await scotsPineThumbnail.count()) === 1 &&
        (await scotsPineThumbnail.getAttribute('style'))?.includes('/thumbnail.jpg'),
      'the Scots Pine generated thumbnail is missing from the table',
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
    assert(
      (await aboutDialog.getByRole('link', { name: /LPF\/SFB/ }).getAttribute('href')) ===
        'https://dados.florestal.gov.br/dataset/banco-de-dados-de-madeiras-brasileiras-do-lpf-sfb',
      'the About drawer has an incorrect Brazilian LPF/SFB URL',
    );
    assert(
      (await aboutDialog
        .getByRole('link', { name: 'fabien.huet@gmail.com', exact: true })
        .getAttribute('href')) === 'mailto:fabien.huet@gmail.com',
      'the About drawer has an incorrect contact email',
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

    const densityHeader = page.locator('thead th').nth(8);
    await densityHeader.getByRole('button').click();
    assert(
      (await densityHeader.getAttribute('aria-sort')) === 'ascending',
      'first sort click did not sort ascending',
    );
    await assertNumericColumnOrder(page, 8, 'ascending', 'Density');
    await densityHeader.getByRole('button').click();
    assert(
      (await densityHeader.getAttribute('aria-sort')) === 'descending',
      'second sort click did not sort descending',
    );
    await assertNumericColumnOrder(page, 8, 'descending', 'Density');
    await densityHeader.getByRole('button').click();
    assert(
      (await densityHeader.getAttribute('aria-sort')) === 'none',
      'third sort click did not clear sorting',
    );
    assert(!new URL(page.url()).searchParams.has('sort'), 'cleared sorting remains in the URL');

    for (const [columnIndex, label] of [
      [3, 'Natural use class'],
      [4, 'Fungi'],
      [5, 'Termites'],
      [6, 'Treatability'],
    ]) {
      const classHeader = page.locator('thead th').nth(columnIndex);
      await classHeader.getByRole('button').click();
      await assertClassColumnOrder(page, columnIndex, 'ascending', label);
      await classHeader.getByRole('button').click();
      await assertClassColumnOrder(page, columnIndex, 'descending', label);
      await classHeader.getByRole('button').click();
    }
    console.log('Class range sorting checked.');

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

    const dryWoodBorerSelect = filterPanel.getByLabel('Dry wood borers', { exact: true });
    const dryWoodBorerOptions = await dryWoodBorerSelect.locator('option').allTextContents();
    assert(
      dryWoodBorerOptions.length === 5 &&
        dryWoodBorerOptions.slice(1).every((value) => value === value.toLocaleLowerCase('en')),
      `dry-wood-borer filter options are missing or not normalized: ${JSON.stringify(dryWoodBorerOptions)}`,
    );
    const dryWoodBorerValue = 'class s - susceptible (risk in all the wood)';
    await dryWoodBorerSelect.selectOption(dryWoodBorerValue);
    assert(
      new URL(page.url()).searchParams.get('dryWoodBorer') === dryWoodBorerValue,
      'dry-wood-borer filter is missing from the URL',
    );
    await page
      .getByRole('button', {
        name: `Remove Dry wood borers: ${dryWoodBorerValue}`,
        exact: true,
      })
      .waitFor();
    await dryWoodBorerSelect.selectOption('');

    const treatabilitySelect = filterPanel.getByLabel('Treatability', { exact: true });
    const treatabilityOptions = await treatabilitySelect.locator('option').allTextContents();
    assert(
      treatabilityOptions.length === 8 &&
        treatabilityOptions.slice(1).every((value) => value === value.toLocaleLowerCase('en')),
      `treatability filter options are missing or not normalized: ${JSON.stringify(treatabilityOptions)}`,
    );

    const naturalUseClassSelect = filterPanel.getByLabel('Natural use class', { exact: true });
    const naturalUseClassOptions = await naturalUseClassSelect.locator('option').allTextContents();
    assert(
      naturalUseClassOptions.length === 16 &&
        naturalUseClassOptions.slice(1).every((value) => value === value.toLocaleLowerCase('en')),
      `natural-use-class filter options are missing or not normalized: ${JSON.stringify(naturalUseClassOptions)}`,
    );
    const naturalUseClassValue = 'class 1 - inside (no dampness)';
    await naturalUseClassSelect.selectOption(naturalUseClassValue);
    assert(
      new URL(page.url()).searchParams.get('naturalUseClass') === naturalUseClassValue,
      'natural-use-class filter is missing from the URL',
    );
    await page
      .getByRole('button', {
        name: `Remove Natural use class: ${naturalUseClassValue}`,
        exact: true,
      })
      .waitFor();
    await naturalUseClassSelect.selectOption('');

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

    await page.addInitScript(() => {
      const NativeDisplayNames = Intl.DisplayNames;
      Intl.DisplayNames = class extends NativeDisplayNames {
        of(code) {
          return /^\d{3}$/u.test(code) ? code : super.of(code);
        }
      };
    });
    await page.goto(`${origin}/?lang=en&wood=america-lpf-ocotea-aciphylla`);
    const southAmericanDetail = page.getByRole('dialog');
    await southAmericanDetail.waitFor();
    await southAmericanDetail.getByText('South America', { exact: true }).waitFor();
    assert(
      (await southAmericanDetail.getByText('005', { exact: true }).count()) === 0,
      'continent display exposed the UN M49 identifier instead of its name',
    );
    console.log('Continent-name fallback checked.');

    await page.goto(`${origin}/?lang=en&wood=america-lpf-pouteria-oppositifolia`);
    const lpfDetail = page.getByRole('dialog');
    await lpfDetail.waitFor();
    await lpfDetail.getByRole('heading', { name: 'Physical measurements' }).waitFor();
    await lpfDetail.getByText('0.74 g/cm³', { exact: true }).waitFor();
    await lpfDetail.getByText('12.5 %', { exact: true }).waitFor();
    await lpfDetail
      .getByRole('heading', { name: 'Mechanical measurements — green wood' })
      .waitFor();
    await lpfDetail.getByText('10,690 MPa', { exact: true }).waitFor();
    assert(
      (
        await lpfDetail
          .getByRole('link', { name: /LPF Brazilian Woods — Pouteria oppositifolia/ })
          .getAttribute('href')
      )?.endsWith('especieestudadaid=205'),
      'LPF measurements do not link to the exact studied-species page',
    );
    await audit(page, 'LPF online measurements');
    console.log('LPF online measurements checked.');

    await page.goto(`${origin}/?lang=de&wood=america-abarco`);
    const germanDetail = page.getByRole('dialog');
    await germanDetail.waitFor();
    const germanDryingRateLabel = germanDetail.getByText('Trocknungsgeschwindigkeit', {
      exact: true,
    });
    await germanDryingRateLabel.waitFor();
    assert(
      await germanDryingRateLabel.evaluate((element) => element.scrollWidth <= element.clientWidth),
      'long German detail labels overflow their grid column',
    );
    console.log('German detail label wrapping checked.');

    await page.goto(`${origin}/?lang=fr`);
    const search = page.getByRole('searchbox');
    await search.fill('chene');
    await page.getByText('Chêne blanc européen', { exact: true }).first().waitFor();
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
    const mobileFilterPanel = page.locator('#filter-panel');
    if ((await mobileFilterPanel.getAttribute('aria-hidden')) === 'true') {
      await page.locator('button[aria-controls="filter-panel"]').click();
    }
    const mobileFilterPanelBox = await mobileFilterPanel.boundingBox();
    assert(mobileFilterPanelBox, 'mobile filter panel could not be measured');
    assert(
      mobileFilterPanelBox.y >= -1 && mobileFilterPanelBox.y + mobileFilterPanelBox.height <= 801,
      `mobile filter panel overflows the viewport: ${JSON.stringify(mobileFilterPanelBox)}`,
    );
    const filterBackdrop = page.getByTestId('filter-backdrop');
    const filterBackdropState = await filterBackdrop.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        pointerEvents: style.pointerEvents,
      };
    });
    assert(
      filterBackdropState.backgroundColor === 'rgba(0, 0, 0, 0.25)',
      `mobile filter backdrop has the wrong color: ${filterBackdropState.backgroundColor}`,
    );
    assert(
      filterBackdropState.pointerEvents === 'auto',
      `open mobile filter backdrop is not interactive: ${filterBackdropState.pointerEvents}`,
    );
    await audit(page, 'mobile filter drawer');
    await filterBackdrop.click({ position: { x: 699, y: 400 } });
    assert(
      (await mobileFilterPanel.getAttribute('aria-hidden')) === 'true',
      'clicking the mobile filter backdrop did not close the panel',
    );
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

async function auditPublishedLpfMeasurements() {
  const [manifest, facts, database] = await Promise.all([
    readJson(new URL('../data/manual/woods/lpf-website.json', import.meta.url)),
    readJson(new URL('../data/raw/lpf/website-facts.json', import.meta.url)),
    readJson(new URL('../public/data/woods.generated.en.json', import.meta.url)),
  ]);
  const recordsById = new Map(database.records.map((record) => [record.id, record]));
  const profilesBySourceId = new Map(facts.profiles.map((profile) => [profile.sourceId, profile]));
  assert(
    manifest.supplements.length === manifest.dataset.supplementedRecords,
    'the LPF website manifest record count is inconsistent',
  );

  for (const supplement of manifest.supplements) {
    const record = recordsById.get(supplement.id);
    assert(record, `LPF record ${supplement.id} is missing from the published database`);
    assert(
      supplement.locales.en.origin.continentCodes?.includes('SA') &&
        supplement.locales.en.origin.countryCodes?.includes('BR') &&
        record.origin.continentCodes.includes('SA') &&
        record.origin.countryCodes.includes('BR'),
      `LPF Brazilian origin metadata is missing from ${supplement.id}`,
    );
    const profiles = supplement.source.references.map((reference) => {
      const sourceId = Number(new URL(reference.url).searchParams.get('especieestudadaid'));
      const profile = profilesBySourceId.get(sourceId);
      assert(profile, `LPF source profile ${sourceId} is missing for ${supplement.id}`);
      return profile;
    });
    const measurements = profiles.map((profile) => profile.page.structured.measurements);
    assert(
      record.physics.specificGravity.value !== null,
      `LPF density is missing from the published record ${supplement.id}`,
    );
    assert(
      record.physics.totalTangentialShrinkage.value !== null,
      `LPF tangential shrinkage is missing from the published record ${supplement.id}`,
    );
    assert(
      record.physics.totalRadialShrinkage.value !== null,
      `LPF radial shrinkage is missing from the published record ${supplement.id}`,
    );
    if (
      measurements.some(
        (measurement) =>
          measurement?.mechanical?.primary?.dry?.jankaHardnessTransverse !== null &&
          measurement?.mechanical?.primary?.dry?.jankaHardnessTransverse !== undefined,
      )
    ) {
      assert(
        record.physics.jankaHardness.value !== null,
        `LPF Janka hardness is missing from the published record ${supplement.id}`,
      );
    }
    if (
      measurements.some(
        (measurement) =>
          measurement?.mechanical?.primary?.dry?.modulusOfElasticity !== null &&
          measurement?.mechanical?.primary?.dry?.modulusOfElasticity !== undefined,
      )
    ) {
      assert(
        record.physics.modulusOfElasticity.value !== null,
        `LPF modulus of elasticity is missing from the published record ${supplement.id}`,
      );
    }
  }
  console.log(`Published LPF measurements checked for ${manifest.supplements.length} woods.`);
  return {
    naturalUseClass: database.records.filter(
      (record) => record.durability.naturalUseClass.value !== null,
    ).length,
    fungi: database.records.filter((record) => record.durability.fungi.value !== null).length,
    termites: database.records.filter((record) => record.durability.termites.value !== null).length,
    treatability: database.records.filter((record) => record.durability.treatability.value !== null)
      .length,
    hardness: database.records.filter(
      (record) =>
        record.physics.monninHardness.value !== null || record.physics.jankaHardness.value !== null,
    ).length,
    density: database.records.filter((record) => record.physics.specificGravity.value !== null)
      .length,
    radialShrinkage: database.records.filter(
      (record) => record.physics.totalRadialShrinkage.value !== null,
    ).length,
    tangentialShrinkage: database.records.filter(
      (record) => record.physics.totalTangentialShrinkage.value !== null,
    ).length,
    modulus: database.records.filter((record) => record.physics.modulusOfElasticity.value !== null)
      .length,
  };
}

async function auditPublishedLignumdataMeasurements() {
  const [manifest, database] = await Promise.all([
    readJson(new URL('../data/manual/woods/lignumdata.json', import.meta.url)),
    readJson(new URL('../public/data/woods.generated.en.json', import.meta.url)),
  ]);
  const recordsById = new Map(database.records.map((record) => [record.id, record]));
  const requestedPaths = [
    'durability.fungi',
    'durability.dryWoodBorers',
    'durability.termites',
    'durability.treatability',
    'durability.sapwoodTreatability',
    'physics.specificGravity',
    'physics.jankaHardness',
    'physics.totalTangentialShrinkage',
    'physics.totalRadialShrinkage',
    'physics.shrinkageRatio',
    'physics.fibreSaturationPoint',
    'physics.thermalConductivity',
    'physics.crushingStrength',
    'physics.staticBendingStrength',
    'physics.modulusOfElasticity',
  ];
  let checkedValues = 0;

  for (const supplement of manifest.supplements) {
    const record = recordsById.get(supplement.id);
    assert(record, `Lignumdata record ${supplement.id} is missing from the published database`);
    const publishedUrls = new Set(record.source.references?.map((reference) => reference.url) ?? []);
    for (const reference of supplement.source.references) {
      assert(
        publishedUrls.has(reference.url),
        `Lignumdata provenance ${reference.url} is missing from ${supplement.id}`,
      );
    }
    for (const path of requestedPaths) {
      const expected = valueAtPath(supplement.locales.en, path);
      if (expected === null || expected === undefined) continue;
      const actual = valueAtPath(record, path);
      assert(
        actual === expected,
        `Lignumdata value ${path} was not published for ${supplement.id}: ${actual} !== ${expected}`,
      );
      checkedValues += 1;
    }
  }
  assert(checkedValues > 0, 'the Lignumdata manifest contains no publishable requested values');
  console.log(
    `Published Lignumdata provenance and ${checkedValues} durability/physical values checked.`,
  );
}

function valueAtPath(value, path) {
  return path.split('.').reduce((current, part) => current?.[part], value)?.value;
}

async function readJson(url) {
  return JSON.parse(await readFile(url, 'utf8'));
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

async function assertClassColumnOrder(page, columnIndex, direction, label) {
  const values = (
    await page.locator(`tbody tr td:nth-child(${columnIndex + 1})`).allTextContents()
  ).map((value) => value.trim());
  const firstMissingIndex = values.indexOf('-');
  if (firstMissingIndex !== -1) {
    assert(
      values.slice(firstMissingIndex).every((value) => value === '-'),
      `${direction} ${label} sort did not keep missing values at the end`,
    );
  }
  const classKeys = values
    .slice(0, firstMissingIndex === -1 ? undefined : firstMissingIndex)
    .map(parseDisplayedClass)
    .filter(Boolean);
  assert(classKeys.length > 0, `${label} did not expose any sortable class values`);
  for (let index = 1; index < classKeys.length; index += 1) {
    const previous = classKeys[index - 1];
    const current = classKeys[index];
    const comparison = previous[0] - current[0] || previous[1] - current[1];
    assert(
      direction === 'ascending' ? comparison <= 0 : comparison >= 0,
      `${direction} ${label} sort has ${previous.join('–')} before ${current.join('–')}`,
    );
  }
}

async function assertNumericColumnOrder(page, columnIndex, direction, label) {
  const values = (
    await page.locator(`tbody tr td:nth-child(${columnIndex + 1})`).allTextContents()
  ).map((value) => value.trim());
  const firstMissingIndex = values.indexOf('-');
  if (firstMissingIndex !== -1) {
    assert(
      values.slice(firstMissingIndex).every((value) => value === '-'),
      `${direction} ${label} sort did not keep missing values at the end`,
    );
  }
  const numbers = values
    .slice(0, firstMissingIndex === -1 ? undefined : firstMissingIndex)
    .map((value) => Number(value.replaceAll(',', '')));
  assert(
    numbers.length > 0 && numbers.every(Number.isFinite),
    `${label} did not expose sortable numeric values`,
  );
  for (let index = 1; index < numbers.length; index += 1) {
    const previous = numbers[index - 1];
    const current = numbers[index];
    assert(
      direction === 'ascending' ? previous <= current : previous >= current,
      `${direction} ${label} sort has ${previous} before ${current}`,
    );
  }
}

async function countNonMissingCells(page, zeroBasedColumnIndex) {
  const values = await page
    .locator(`tbody tr td:nth-child(${zeroBasedColumnIndex + 1})`)
    .allTextContents();
  return values.filter((value) => value.trim() !== '-').length;
}

function parseDisplayedClass(value) {
  const match = value.match(/^Class\s+(\d+(?:\.\d+)?|[DMS])(?:–(\d+(?:\.\d+)?|[DMS]))?$/i);
  if (!match) return null;
  const start = displayedClassTokenValue(match[1]);
  const end = match[2] ? displayedClassTokenValue(match[2]) : start;
  return start === null || end === null ? null : [start, end];
}

function displayedClassTokenValue(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  return { D: 1, M: 2, S: 3 }[value.toUpperCase()] ?? null;
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
