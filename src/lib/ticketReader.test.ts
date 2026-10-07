import { describe, expect, it } from "vitest";
import { isImage, isPdf, linesFromPdfItems, readTicketText } from "./ticketReader";

const item = (str: string, x: number, y: number) => ({ str, transform: [1, 0, 0, 1, x, y] });

describe("linesFromPdfItems", () => {
  it("puts pieces on the same line together, top to bottom and left to right", () => {
    const text = linesFromPdfItems([
      item("Show Time:", 200, 700), item("Date: 18/10/2026", 40, 700),
      item("Seat No: J-7, J-8", 40, 650),
      item("09:15 PM", 300, 701),
      item("   ", 40, 600)
    ]);
    expect(text).toBe("Date: 18/10/2026 Show Time: 09:15 PM\nSeat No: J-7, J-8");
  });
});

describe("file kinds", () => {
  it("tells PDFs and images apart by type or name", () => {
    expect(isPdf({ type: "application/pdf", name: "x" })).toBe(true);
    expect(isPdf({ type: "", name: "ticket.PDF" })).toBe(true);
    expect(isImage({ type: "image/png", name: "x" })).toBe(true);
    expect(isImage({ type: "", name: "IMG_1234.HEIC" })).toBe(true);
    expect(isImage({ type: "text/plain", name: "notes.txt" })).toBe(false);
  });

  it("refuses files that aren't tickets, and very large ones", async () => {
    await expect(readTicketText({ type: "text/plain", name: "notes.txt", size: 10 } as File)).rejects.toThrow(/screenshot, photo or PDF/);
    await expect(readTicketText({ type: "image/png", name: "big.png", size: 20 * 1024 * 1024 } as File)).rejects.toThrow(/too big/);
  });
});
