import { describe, expect, it } from "vitest";
import { pickCrew } from "./tmdb";

const person = (id: number, name: string, job: string) => ({ id, name, job, profile_path: null });

describe("key crew", () => {
  it("names each key job in order, a person with several jobs once", () => {
    const crew = pickCrew([
      person(3, "Hoyte van Hoytema", "Director of Photography"),
      person(1, "Christopher Nolan", "Director"),
      person(1, "Christopher Nolan", "Screenplay"),
      person(2, "Emma Thomas", "Producer"),
      person(1, "Christopher Nolan", "Producer"),
      person(4, "Ludwig Göransson", "Original Music Composer"),
      person(5, "Jennifer Lame", "Editor"),
      person(6, "Someone", "Grip")
    ]);
    expect(crew.map((item) => [item.name, item.jobs.join(", ")])).toEqual([
      ["Christopher Nolan", "Director, Writer, Producer"],
      ["Emma Thomas", "Producer"],
      ["Hoyte van Hoytema", "Cinematographer"],
      ["Ludwig Göransson", "Music"],
      ["Jennifer Lame", "Editor"]
    ]);
  });

  it("puts a show's creators first, and lets executive producers stand in only when there's no producer", () => {
    const crew = pickCrew([person(8, "Ben Stiller", "Executive Producer"), person(9, "Jessica Lee Gagné", "Director of Photography")], [{ id: 7, name: "Blake Crouch" }]);
    expect(crew.map((item) => [item.name, item.jobs.join(", ")])).toEqual([
      ["Blake Crouch", "Creator"],
      ["Ben Stiller", "Executive producer"],
      ["Jessica Lee Gagné", "Cinematographer"]
    ]);
    expect(pickCrew([person(1, "A", "Producer"), person(2, "B", "Executive Producer")]).map((item) => item.name)).toEqual(["A"]);
  });

  it("caps each job, so a long producer list doesn't take over", () => {
    const producers = Array.from({ length: 8 }, (_, index) => person(index + 1, `P${index + 1}`, "Producer"));
    expect(pickCrew(producers)).toHaveLength(3);
  });
});
