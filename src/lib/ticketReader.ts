// Getting the text out of a ticket file, in the browser. A PDF e-ticket's text is read directly; a screenshot or
// photo goes through text recognition (tesseract.js), whose files the site serves itself from ./ocr/ (see
// scripts/copy-ocr.mjs). Both libraries are loaded only when someone adds a ticket, and the file never leaves
// the device.

export const MAX_TICKET_BYTES = 15 * 1024 * 1024;

export type ReadStage = "loading" | "reading";

export function isPdf(file: Pick<File, "type" | "name">): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

export function isImage(file: Pick<File, "type" | "name">): boolean {
  return file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|heic|heif)$/i.test(file.name);
}

interface TextItem { str: string; transform: number[] }

/** Joins a PDF page's text pieces into lines, top to bottom and left to right. */
export function linesFromPdfItems(items: TextItem[]): string {
  const rows = new Map<number, { x: number; text: string }[]>();
  for (const item of items) {
    if (!item.str?.trim()) continue;
    // Pieces within a few points of each other vertically are on the same line.
    const y = item.transform[5];
    const key = [...rows.keys()].find((rowY) => Math.abs(rowY - y) <= 3) ?? y;
    const row = rows.get(key) ?? [];
    row.push({ x: item.transform[4], text: item.str });
    rows.set(key, row);
  }
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, row]) => row.sort((a, b) => a.x - b.x).map((piece) => piece.text.trim()).join(" "))
    .join("\n");
}

async function readPdf(file: File, onStage: (stage: ReadStage) => void): Promise<string> {
  onStage("loading");
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  onStage("reading");
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: string[] = [];
  for (let n = 1; n <= Math.min(pdf.numPages, 3); n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    pages.push(linesFromPdfItems(content.items as TextItem[]));
  }
  const text = pages.join("\n").trim();
  if (text.replace(/\s/g, "").length >= 20) return text;
  // A scanned PDF has no text in it: draw the first page and read it like a photo.
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return text;
  return recognise(blob, onStage);
}

async function recognise(image: Blob, onStage: (stage: ReadStage) => void): Promise<string> {
  onStage("loading");
  const { createWorker } = await import("tesseract.js");
  const base = new URL("./ocr/", document.baseURI).href;
  const worker = await createWorker("eng", 1, {
    workerPath: `${base}worker.min.js`,
    corePath: base,
    langPath: base,
    // A worker from this site's own file, not a blob: URL, so the page's security policy allows it.
    workerBlobURL: false,
    gzip: true
  });
  try {
    onStage("reading");
    const { data } = await worker.recognize(image);
    return data.text;
  } finally {
    void worker.terminate();
  }
}

/** The text in a ticket file: a PDF's own text, or what text recognition finds in an image. */
export async function readTicketText(file: File, onStage: (stage: ReadStage) => void = () => {}): Promise<string> {
  if (file.size > MAX_TICKET_BYTES) throw new Error("That file is too big. Choose one under 15 MB.");
  if (isPdf(file)) return readPdf(file, onStage);
  if (isImage(file)) return recognise(file, onStage);
  throw new Error("Choose a screenshot, photo or PDF of the ticket.");
}
