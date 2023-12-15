const puppeteer = require("puppeteer-extra");
const fs = require("fs");
const { createObjectCsvWriter } = require("csv-writer");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const UserAgent = require("user-agents");
const { options, zanimanja } = require("./options");

puppeteer.use(StealthPlugin());

let globalIdCounter = 1;

async function scrapeWebsite() {
  fs.truncateSync("scraped_results.csv", 0);

  const browser = await puppeteer.launch({ headless: false });
  const userAgent = new UserAgent();

  for (const url of zanimanja) {
    const page = await browser.newPage();
    await page.setUserAgent(userAgent.toString());
    await page.goto(url + "?" + options.DATUM_VPISA, {
      waitUntil: "domcontentloaded",
    });

    await page.setViewport({ width: 1280, height: 720 });

    const results = await scrapeCurrentPage(page);

    const csvData = parseResults(results);
    await saveToCsv(csvData, "scraped_results.csv");

    let currentPage = 1;
    while (true) {
      const nextPageButton = await page.$(".paging_next a");
      if (!nextPageButton) {
        break;
      }

      await goToNextPage(page);
      const currentPageResults = await scrapeCurrentPage(page);

      const csvData = parseResults(currentPageResults);
      await saveToCsv(csvData, "scraped_results.csv");

      currentPage++;

      const randomWaitTime = Math.floor(Math.random() * 5000) + 1000;

      await new Promise((resolve) => setTimeout(resolve, randomWaitTime));
    }

    await page.close();
  }

  await browser.close();
}

async function scrapeCurrentPage(page) {
  await page.waitForSelector(".property-details");

  const elements = await page.$$(".property-details");
  const results = [];
  for (const element of elements) {
    const title = await element.$eval("h2", (h2) => h2.textContent.trim());

    const textContent = await page.evaluate(
      (el) => el.textContent.replace(/\s+/g, " ").trim(),
      element
    );

    results.push({ title, textContent });
  }
  return results;
}

async function goToNextPage(page) {
  const nextPageButton = await page.$(".paging_next a");
  if (nextPageButton) {
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded" }),
      nextPageButton.click(),
    ]);
  }
}

function parseResults(results) {
  return results.map((result) => {
    // console.log(result);
    const columns = result.textContent.split(" ");
    const title = result.title;
    // console.log(columns);

    const tipIndex = columns.indexOf("Stanovanje,");
    const stSobIndex = columns.findIndex((word) => word.includes("-sobno"));
    const m2Index = columns.indexOf("m2");
    const adaptiranoIndex = columns.indexOf("adaptirano");
    const tipPonudbe = columns.includes("Zasebna") ? "Zasebna" : "Agencija";
    const cenaIndex = columns.indexOf("€");

    const cena =
      cenaIndex !== -1
        ? columns[cenaIndex - 1].replace(",00", "").replace('"', "")
        : null;
    const m2 =
      m2Index !== -1
        ? parseFloat(columns[m2Index - 1].replace(",", "."))
        : null;
    columns[tipIndex] = columns[tipIndex].replace(",", "").replace('"', "");
    const st_sob =
      stSobIndex !== -1 ? columns[stSobIndex].replace("-sobno", "") : null;
    const leto_gradnje = columns[m2Index + 1].replace(",", "");
    let adaptirano =
      columns[adaptiranoIndex] !== -1
        ? columns[adaptiranoIndex + 2].replace(",", "").replace('"', "")
        : null;
    if (
      adaptirano == "Stanovanje" ||
      adaptirano == "spreglejte" ||
      leto_gradnje > 2016
    ) {
      adaptirano = null;
    }

    return {
      id: globalIdCounter++,
      tip: columns[tipIndex],
      st_sob: st_sob,
      lokacija: title,
      m2: m2,
      leto_gradnje: leto_gradnje,
      leto_adaptacije: adaptirano,
      tip_ponudbe: tipPonudbe,
      cena: cena,
    };
  });
}

async function saveToCsv(data, filename) {
  const csvWriterInstance = createObjectCsvWriter({
    path: filename,
    header: [
      { id: "id", title: "ID" },
      { id: "tip", title: "tip" },
      { id: "st_sob", title: "st_sob" },
      { id: "lokacija", title: "lokacija" },
      { id: "m2", title: "m2" },
      { id: "leto_gradnje", title: "leto_gradnje" },
      { id: "leto_adaptacije", title: "leto_adaptacije" },
      { id: "tip_ponudbe", title: "tip_ponudbe" },
      { id: "cena", title: "cena" },
    ],
    append: true,
  });
  if (globalIdCounter === 26) {
    await csvWriterInstance.writeRecords([{}]);
  }
  await csvWriterInstance.writeRecords(data);
}

scrapeWebsite();
