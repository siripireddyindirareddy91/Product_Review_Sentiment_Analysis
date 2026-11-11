import { describe, expect, it } from "vitest";
import { endpoint } from "./api";

describe("workspace API URLs", () => {
  it("keeps dataset selection, false boolean filters, and escaped text", () => {
    const url = endpoint("/reviews", 4, {
      search: "power & battery",
      verified: false,
      page: 2,
      category: "",
    });
    expect(url).toBe(
      "/reviews?dataset=4&search=power+%26+battery&verified=false&page=2",
    );
  });
  it("omits absent filters for the demo", () => {
    expect(
      endpoint("/analytics/overview", undefined, { product: undefined }),
    ).toBe("/analytics/overview");
  });
});
