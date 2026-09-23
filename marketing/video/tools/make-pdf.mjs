// Render docs/chompy-setup.html → docs/chompy-setup.pdf using Playwright's
// bundled Chromium. Embeds the app logo as a data URI so no file:// loads are
// needed. Usage: node tools/make-pdf.mjs
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..", ".."); // marketing/video/tools → repo root
const htmlPath = join(repo, "docs", "chompy-setup.html");
const pdfPath = join(repo, "docs", "chompy-setup.pdf");
const logoPath = join(repo, "public", "icons", "icon-512.png");

const logo = `data:image/png;base64,${(await readFile(logoPath)).toString("base64")}`;
const html = (await readFile(htmlPath, "utf8")).replaceAll("{{LOGO}}", logo);

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "networkidle" });
await page.pdf({
  path: pdfPath,
  format: "A4",
  printBackground: true,
  margin: { top: "0", bottom: "0", left: "0", right: "0" },
});
await browser.close();
console.log(`✔ PDF written → ${pdfPath}`);
