const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const FORM_URL = process.env.FORM_URL || 'https://forms.cloud.microsoft/r/2Y9qZJUUdS?origin=lprLink';

const MULTIPLE_CHOICE_ANSWERS = [
  '18 a 30 años',
  'Área agrícola',
  'He hecho compostaje',
  'Quiero empezar a compostar'
];

const TEXT_ANSWER =
  process.env.TEXT_ANSWER ||
  'Me interesa el compostaje porque ayuda a mejorar suelos agrícolas y reducir residuos orgánicos en comunidades jóvenes rurales.';

async function clickByVisibleText(page, text) {
  const clicked = await page.evaluate((rawText) => {
    const normalizeText = (value) =>
      value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const target = normalizeText(rawText);

    const candidates = Array.from(
      document.querySelectorAll(
        'div[role="radio"], div[role="checkbox"], button, label, span, div'
      )
    );

    const match =
      candidates.find((element) => normalizeText(element.textContent || '') === target) ||
      candidates.find((element) => normalizeText(element.textContent || '').includes(target));

    if (!match) {
      return false;
    }

    match.click();
    return true;
  }, text);

  if (!clicked) {
    throw new Error(`No se encontró una opción con texto similar a: ${text}`);
  }
}

async function fillTextIfPresent(page, text) {
  const selector = 'textarea, input[type="text"]';
  const element = await page.$(selector);

  if (!element) {
    return false;
  }

  await page.click(selector, { clickCount: 3 });
  await page.type(selector, text, { delay: 40 });
  return true;
}

async function submitForm(page) {
  const submitted = await page.evaluate(() => {
    const normalizeText = (value) =>
      value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const submitKeywords = ['enviar', 'submit'];
    const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));

    const submitButton = buttons.find((button) =>
      submitKeywords.some((keyword) => normalizeText(button.textContent || '').includes(keyword))
    );

    if (!submitButton) {
      return false;
    }

    submitButton.click();
    return true;
  });

  if (!submitted) {
    throw new Error('No se encontró el botón de enviar.');
  }
}

async function run() {
  const browser = await puppeteer.launch({
    headless: process.env.HEADLESS === 'true',
    args: ['--start-maximized']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });

  try {
    console.log(`Abriendo formulario: ${FORM_URL}`);
    await page.goto(FORM_URL, { waitUntil: 'networkidle2', timeout: 60000 });

    await page.waitForSelector('div[role="radio"], div[role="checkbox"], button, label', {
      timeout: 20000
    });

    for (const answer of MULTIPLE_CHOICE_ANSWERS) {
      console.log(`Intentando marcar: ${answer}`);
      await clickByVisibleText(page, answer);
      await page.waitForTimeout(500 + Math.random() * 800);
    }

    if (await fillTextIfPresent(page, TEXT_ANSWER)) {
      console.log('Campo de texto detectado y completado.');
    }

    await page.waitForTimeout(800);
    await submitForm(page);

    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(async () => {
      await page.waitForTimeout(3000);
    });

    console.log('Formulario enviado correctamente.');
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  const details = error && error.stack ? error.stack : String(error);
  console.error(`Error durante la automatización: ${details}`);
  process.exitCode = 1;
});
