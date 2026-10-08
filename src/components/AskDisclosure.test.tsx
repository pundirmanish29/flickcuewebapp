import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CALENDAR_SCOPE, GOOGLE_SCOPE } from "../lib/config";
import { AskDisclosure } from "./Landing";

describe("what Google asks for, said before the sign-in window", () => {
  const html = renderToStaticMarkup(<AskDisclosure />);

  it("names what is asked: the private Drive folder, the profile, and nothing else up front", () => {
    expect(html).toContain("What does Google ask for?");
    expect(html).toContain("private folder for FlickCue in your Google Drive");
    expect(html).toContain("name, email and photo");
    expect(html).toContain("Nothing else.");
  });

  it("says Calendar comes later and only by choice, and how to take access back", () => {
    expect(html).toMatch(/Calendar permission is asked for later/);
    expect(html).toContain("Sign out in FlickCue revokes it");
    expect(html).toContain('href="./privacy.html"');
  });

  it("stays true to the permissions the app really requests", () => {
    // The copy promises a private app folder and a calendar FlickCue makes itself: a wider scope would make it false.
    expect(GOOGLE_SCOPE).toBe("https://www.googleapis.com/auth/drive.appdata");
    expect(CALENDAR_SCOPE).toBe("https://www.googleapis.com/auth/calendar.app.created");
  });
});
