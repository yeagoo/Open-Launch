import { describe, expect, it } from "vitest"

import { communityFeedHref, communityPostHref, parseCommunityFeedQuery } from "./urls"

describe("community URL contract", () => {
  it("parses only the documented first values and defaults malformed filters", () => {
    expect(
      parseCommunityFeedQuery({
        type: ["question", "todo"],
        view: "saved",
        sort: "hot",
        q: "launch notes",
        cursor: "cursor",
      }),
    ).toEqual({
      type: "Question",
      view: "saved",
      sort: "Latest",
      search: "launch notes",
      cursor: "cursor",
    })
    expect(parseCommunityFeedQuery({ type: "unknown", view: "staff", sort: "popular" })).toEqual({
      type: "All",
      view: "all",
      sort: "Latest",
      search: "",
      cursor: undefined,
    })
  })

  it("serializes a canonical, encoded feed URL and never advertises Hot for personal views", () => {
    expect(
      communityFeedHref({
        type: "Todo",
        view: "all",
        sort: "Hot",
        search: "100% maker notes",
        cursor: "next_token",
      }),
    ).toBe("/community?type=todo&sort=hot&q=100%25+maker+notes&cursor=next_token")
    expect(
      communityFeedHref({ type: "All", view: "saved", sort: "Hot", search: "", cursor: undefined }),
    ).toBe("/community?view=saved")
    expect(communityPostHref("post/a b")).toBe("/community/t/post%2Fa%20b")
  })
})
