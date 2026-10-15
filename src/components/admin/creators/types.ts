import type {
  adminGetCreator,
  adminListCreators,
  adminListUnmatched,
} from "@/lib/hub/admin.functions";

// What the /admin/creators loaders return, named for the components.

export type CreatorsList = Awaited<ReturnType<typeof adminListCreators>>;
export type CreatorRow = CreatorsList["creators"][number];
export type InviteRow = CreatorsList["invites"][number];
export type UnmatchedOrder = Awaited<ReturnType<typeof adminListUnmatched>>[number];

export type CreatorDetail = NonNullable<Awaited<ReturnType<typeof adminGetCreator>>>;
