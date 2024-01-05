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
  // Extracting location from the URL
  const url = page.url();
  const regionMatch = url.match(/oglasi-prodaja\/([^\/]+)/);
  const lokacija = regionMatch ? regionMatch[1] : "";
  // Extracting category from the URL
  const urlParts = url.split("/");
  const tip = urlParts[5] || "";

  await page.waitForSelector(".property-details");
  const elements = await page.$$(".property-details");
  const results = [];
  for (const element of elements) {
    const title = await element.$eval("h2", (h2) => h2.textContent.trim());

    const textContent = await page.evaluate(
      (el) => el.textContent.replace(/\s+/g, " ").trim(),
      element
    );

    const ulElement = await element.$(
      "ul[itemprop='disambiguatingDescription']"
    );
    let m2 = await ulElement.$eval("li", (li) => li.textContent.trim());
    m2 = m2.replace(" m2", "").replace(",", ".");
    const leto_gradnje = await ulElement.$eval("li:nth-child(2)", (li) =>
      li.textContent.trim()
    );

    results.push({ title, textContent, m2, leto_gradnje, lokacija, tip });
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
    const m2 = result.m2;
    const leto_gradnje = result.leto_gradnje;
    const lokacija = result.lokacija;
    const tip = result.tip;
    // console.log(columns);

    const stSobIndex = columns.findIndex((word) => word.includes("-sobno"));
    const adaptiranoIndex = columns.indexOf("adaptirano");
    const tipPonudbe = columns.includes("Zasebna") ? "Zasebna" : "Agencija";
    const cenaIndex = columns.indexOf("€");

    let hisa_tip;
    if (tip == "hisa") {
      hisa_tip = columns[columns.indexOf("Hiša,") + 1];
    }
    let cena =
      cenaIndex !== -1
        ? columns[cenaIndex - 1].replace(",00", "").replace('"', "")
        : null;
    if (cena !== null) {
      cena = cena.split(",")[0];
    }
    let st_sob =
      stSobIndex !== -1
        ? columns[stSobIndex].replace("-sobno", "").replace(",", ".")
        : null;
    st_sob = typeof st_sob === "string" ? parseFloat(st_sob) : st_sob;
    let adaptirano =
      columns[adaptiranoIndex] !== -1
        ? columns[adaptiranoIndex + 2].replace(",", "").replace('"', "")
        : null;
    if (
      adaptirano == "Stanovanje" ||
      adaptirano == "spreglejte" ||
      adaptirano == "Hiša" ||
      leto_gradnje > 2016
    ) {
      adaptirano = null;
    }

    return {
      id: globalIdCounter++,
      tip: tip,
      st_sob: st_sob,
      hisa_tip: hisa_tip,
      lokacija: lokacija,
      lokacija_podrobno: title,
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
      { id: "hisa_tip", title: "hisa_tip" },
      { id: "lokacija", title: "lokacija" },
      { id: "lokacija_podrobno", title: "lokacija_podrobno" },
      { id: "m2", title: "m2" },
      { id: "leto_gradnje", title: "leto_gradnje" },
      { id: "leto_adaptacije", title: "leto_adaptacije" },
      { id: "tip_ponudbe", title: "tip_ponudbe" },
      { id: "cena", title: "cena" },
    ],
    append: true,
  });
  if (globalIdCounter === 26) {
    await csvWriterInstance.writeRecords([
      {
        id: "id",
        tip: "tip",
        st_sob: "st_sob",
        hisa_tip: "hisa_tip",
        lokacija: "lokacija",
        lokacija_podrobno: "lokacija_podrobno",
        m2: "m2",
        leto_gradnje: "leto_gradnje",
        leto_adaptacije: "leto_adaptacije",
        tip_ponudbe: "tip_ponudbe",
        cena: "cena",
      },
    ]);
  }
  await csvWriterInstance.writeRecords(data);
}

scrapeWebsite();
