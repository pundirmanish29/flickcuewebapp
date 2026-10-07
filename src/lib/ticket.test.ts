import { describe, expect, it } from "vitest";
import { parseTicket, showTimeOf } from "./ticket";

const now = new Date(2026, 9, 7, 12, 0).getTime(); // Wed 7 October 2026, noon

describe("parseTicket", () => {
  it("reads a BookMyShow app screenshot", () => {
    const text = `BookMyShow
Dune: Part Two (UA)
English, 2D
Sat, 11 Oct | 07:30 PM
PVR: Select Citywalk, Saket
AUDI 05
2 Ticket(s)
GOLD - H12, H13
BOOKING ID: WGBK7MSX
Cancellation not available for this venue`;
    expect(parseTicket(text, now)).toEqual({
      date: "2026-10-11", time: "19:30", cinema: "PVR: Select Citywalk, Saket", screen: "Audi 5",
      seats: ["H12", "H13"], bookingId: "WGBK7MSX", source: "bookmyshow"
    });
  });

  it("reads a District confirmation", () => {
    const text = `district
Your tickets are confirmed
Kantara: Chapter 1
Hindi • 2D
Sunday, 12 October 2026
10:45 AM
INOX: Nehru Place, New Delhi
Screen 3
Seats: F7, F8, F9
Booking ID 7F3KQ29ZL`;
    expect(parseTicket(text, now)).toEqual({
      date: "2026-10-12", time: "10:45", cinema: "INOX: Nehru Place, New Delhi", screen: "Screen 3",
      seats: ["F7", "F8", "F9"], bookingId: "7F3KQ29ZL", source: "district"
    });
  });

  it("reads a PVR INOX e-ticket, ignoring when it was booked and what it cost", () => {
    const text = `PVR INOX
E-TICKET
Movie: Dune: Part Two (UA)
Date: 18/10/2026 Show Time: 09:15 PM
Cinema: PVR Director's Cut, Ambience Mall, Vasant Kunj
Audi: 2
Seat No: J-7, J-8
Booking Id : 1234567890
Booked on 06/10/2026 11:02 AM
Total Amount Rs. 1,250.00`;
    expect(parseTicket(text, now)).toEqual({
      date: "2026-10-18", time: "21:15", cinema: "PVR Director's Cut, Ambience Mall, Vasant Kunj", screen: "Audi 2",
      seats: ["J7", "J8"], bookingId: "1234567890", source: "pvr"
    });
  });

  it("reads a Cinépolis confirmation with a row and seat numbers", () => {
    const text = `Cinépolis
Booking Confirmed
Show: Oct 19, 2026 6:00 PM
Cinépolis: DLF Place, Saket
Hall 4
Row H Seats 5, 6
Confirmation No. CPX99812`;
    expect(parseTicket(text, now)).toEqual({
      date: "2026-10-19", time: "18:00", cinema: "Cinépolis: DLF Place, Saket", screen: "Hall 4",
      seats: ["H5", "H6"], bookingId: "CPX99812", source: "cinepolis"
    });
  });

  it("puts a date with no year on the next one to come", () => {
    const text = `Booked on Fri 2 Oct
SHOWTIME Fri 9 Jan 19:30
Wave Cinemas, Noida
SEATS
D4 D5`;
    const ticket = parseTicket(text, now);
    expect(ticket.date).toBe("2027-01-09");
    expect(ticket.time).toBe("19:30");
    expect(ticket.cinema).toBe("Wave Cinemas, Noida");
    expect(ticket.seats).toEqual(["D4", "D5"]);
  });

  it("copes with text recognition reading a 0 as an O", () => {
    expect(parseTicket("Sat, 11 Oct  O7:3O PM", now).time).toBe("19:30");
  });

  it("doesn't take a price for a time or a word for a booking id", () => {
    const ticket = parseTicket("Booking Confirmed\nTotal Rs. 12.50\nThanks!", now);
    expect(ticket.time).toBeUndefined();
    expect(ticket.bookingId).toBeUndefined();
  });

  it("finds nothing in text that isn't a ticket", () => {
    expect(parseTicket("hello world", now)).toEqual({ seats: [], source: "other" });
    expect(parseTicket("", now)).toEqual({ seats: [], source: "other" });
  });
});

describe("showTimeOf", () => {
  it("joins a date and a time in this device's time zone", () => {
    expect(showTimeOf("2026-10-11", "19:30")).toBe(new Date(2026, 9, 11, 19, 30).getTime());
  });

  it("needs both", () => {
    expect(showTimeOf("2026-10-11", undefined)).toBeNull();
    expect(showTimeOf(undefined, "19:30")).toBeNull();
    expect(showTimeOf("11/10/2026", "19:30")).toBeNull();
  });
});
