import type {
  adminGetUgcCampaign,
  adminGetUgcCreator,
  adminListUgcCampaigns,
  adminUgcImportStatus,
  adminUgcPipeline,
  adminUgcReviewQueue,
  adminUgcShipping,
} from "@/lib/ugc/admin.functions";

// What the /admin/ugc loaders return, named for the components.

export type Pipeline = Awaited<ReturnType<typeof adminUgcPipeline>>;
export type CreatorSummary = Pipeline["creators"][number];
export type PipelineCampaign = Pipeline["campaigns"][number];
export type CreatorDetail = NonNullable<Awaited<ReturnType<typeof adminGetUgcCreator>>>;
export type CampaignList = Awaited<ReturnType<typeof adminListUgcCampaigns>>;
export type CampaignDetail = NonNullable<Awaited<ReturnType<typeof adminGetUgcCampaign>>>;
export type ShippingRow = Awaited<ReturnType<typeof adminUgcShipping>>[number];
export type ReviewItem = Awaited<ReturnType<typeof adminUgcReviewQueue>>[number];
export type ImportStatus = Awaited<ReturnType<typeof adminUgcImportStatus>>;
