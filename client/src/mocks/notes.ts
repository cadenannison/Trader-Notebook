import type { UserNote } from "@shared/types";

export const MOCK_NOTES: UserNote[] = [
  {
    id: "note-1",
    ticker: "NVDA",
    content:
      "Strong AI demand is driving data center growth. Jensen's roadmap looks credible — Blackwell compelling for the next 18 months.",
    created_at: "2026-04-20T10:23:00Z",
  },
  {
    id: "note-2",
    ticker: "NVDA",
    content:
      "Concerned about export restrictions to China eating into margins. Need to watch guidance on the next earnings call.",
    created_at: "2026-04-15T14:05:00Z",
  },
  {
    id: "note-3",
    ticker: "VGT",
    content:
      "Tech sector consolidation looks healthy. VGT gives broad exposure without single-stock concentration risk.",
    created_at: "2026-04-12T09:00:00Z",
  },
  {
    id: "note-4",
    ticker: "AAPL",
    content:
      "Services revenue is the story now. Hardware growth has plateaued but margins on services are exceptional.",
    created_at: "2026-04-10T16:30:00Z",
  },
];
