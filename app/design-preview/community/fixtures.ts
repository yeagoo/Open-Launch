import type { CommunityPost, ProductContext } from "@/lib/community/contracts"

export const demoProducts: ProductContext[] = [
  { id: "tallykit", name: "Tallykit", description: "Simple reporting for small teams" },
  { id: "fieldnotes", name: "Fieldnotes", description: "A research notebook for designers" },
  { id: "pocketinvoice", name: "Pocket Invoice", description: "Invoicing for independent work" },
]

export function createDemoPosts(): CommunityPost[] {
  const rows = [
    {
      id: "small-release",
      body: "CSV export is live in Tallykit. A small release, but it saves our customers from copying reports one row at a time.\n\nThree people asked for it last week. Today, all three are using it. What would make exporting your reports easier?",
      type: "Shipped",
      author: "Sam Wilson",
    },
    {
      id: "landing-feedback",
      body: "I’m building a research notebook for independent designers. The current headline is “Keep your research connected.”\n\nFive testers thought it was a bookmarks app. It actually connects interview notes to design decisions. What would you need to know before trying it?",
      type: "Question",
      author: "Leo Park",
    },
    {
      id: "first-users",
      body: "I spent three weeks polishing a landing page and got no signups. Last week, I spoke to five people who deal with the problem every day.\n\nTwo are now testing the prototype. The useful question was “Show me how you do this today.” Watching their workflow taught me more than asking whether they liked my idea.",
      type: "Learning",
      author: "Maya Chen",
    },
    {
      id: "first-customer",
      body: "Pocket Invoice has its first paying customer today.\n\nShe found it through a guide I wrote about chasing overdue invoices. We fixed one missing tax field together before she subscribed. Next goal: help five freelancers send their first invoice.",
      type: "Milestone",
      author: "Ari Patel",
    },
    {
      id: "this-week",
      body: "This week: cut onboarding from six steps to three.\n\nI’ll remove the workspace setup screen and let people try a sample project first. Success means a new tester can finish their first task in under two minutes. I’ll share what happens on Friday.",
      type: "Todo",
      author: "Nora Ellis",
    },
  ]
  return rows.map((row, index) => ({
    ...row,
    type: row.type as CommunityPost["type"],
    authorId: index === 2 ? "you" : `maker-${index}`,
    author: index === 2 ? "You · Demo member" : row.author,
    title: index === 1 ? "Would you understand Fieldnotes from this description?" : "",
    product: index < 2 ? demoProducts[index] : index === 3 ? demoProducts[2] : undefined,
    votes: [31, 16, 24, 19, 7][index] ?? 0,
    voted: false,
    saved: false,
    replies: [],
    state: "public",
    locked: false,
    pinned: false,
    version: 1,
    createdAt: Date.UTC(2026, 8, 14, 12 - index),
  }))
}
