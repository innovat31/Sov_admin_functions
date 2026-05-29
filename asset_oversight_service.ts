import { supabase as supabaseClient } from "@/lib/supabaseClient";


export type AssetApprovalStatus = "pending_review" | "approved" | "rejected";
export type AssetFlagType = "suspicious" | "invalid" | "duplicate" | "compliance" | "other";
export type AssetModule = "real_estate" | "invoice_financing" | "supply_chain_finance" | "green_energy" | "all";

export interface CrossModuleAsset {
  id: number;
  name: string;
  slug: string;
  module: string;
  categoryId: number;
  categoryName?: string;
  description: string | null;
  location: string | null;
  image: string | null;
  totalValue: number;
  minInvestment: number;
  expectedRoi: number;
  status: "active" | "paused" | "completed" | "upcoming";
  riskLevel: "low" | "moderate" | "high";
  fundingProgress: number;
  fundedAmount: number;
  createdAt?: string;
  tags?: string[];
  approvalStatus?: AssetApprovalStatus;
  flags?: AssetFlag[];
}

export interface AssetFlag {
  id?: number;
  assetId: number;
  flagType: AssetFlagType;
  reason: string;
  flaggedBy: string | number;
  flaggedAt: string;
  resolvedBy?: string | number;
  resolvedAt?: string;
  isResolved: boolean;
  metadata?: Record<string, any>;
}

export interface AssetApprovalRecord {
  id?: number;
  assetId: number;
  assetName: string;
  previousStatus: AssetApprovalStatus;
  newStatus: AssetApprovalStatus;
  reviewedBy: string | number;
  reviewNotes?: string;
  reviewedAt: string;
}

export interface AssetTag {
  id?: number;
  name: string;
  slug: string;
  color?: string;
  description?: string;
  assetCount?: number;
}

export interface AssetCategoryGroup {
  categoryId: number;
  categoryName: string;
  categorySlug: string;
  assetCount: number;
  totalValue: number;
  averageRoi: number;
  assets: CrossModuleAsset[];
}

export async function fetchAllCrossModuleAssets(options?: {
  module?: AssetModule;
  status?: string;
  riskLevel?: string;
  searchQuery?: string;
  sortBy?: "totalValue" | "expectedRoi" | "fundingProgress" | "createdAt";
  sortOrder?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}): Promise<{ assets: CrossModuleAsset[]; total: number }> {
  try {
    let query = supabaseClient
      .from("assets")
      .select("*, asset_categories(name, slug)", { count: "exact" });

    // Filters
    if (options?.status && options.status !== "all") {
      query = query.eq("status", options.status);
    }
    if (options?.riskLevel && options.riskLevel !== "all") {
      query = query.eq("riskLevel", options.riskLevel);
    }
    if (options?.searchQuery) {
      query = query.or(
        `name.ilike.%${options.searchQuery}%,description.ilike.%${options.searchQuery}%,location.ilike.%${options.searchQuery}%`
      );
    }

    // Sorting
    const sortColumn = options?.sortBy || "createdAt";
    const ascending = options?.sortOrder === "asc";
    query = query.order(sortColumn, { ascending });

    // Pagination
    const page = options?.page ?? 1;
    const pageSize = options?.pageSize ?? 50;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) throw error;
    if (!data || data.length === 0) {
      const mockAssets = getMockCrossModuleAssets();
      return { assets: mockAssets, total: mockAssets.length };
    }

    const assets: CrossModuleAsset[] = data.map((a: any) => ({
      id: Number(a.id),
      name: a.name,
      slug: a.slug,
      module: a.asset_categories?.slug || "unknown",
      categoryId: Number(a.categoryId),
      categoryName: a.asset_categories?.name || "Unknown",
      description: a.description,
      location: a.location,
      image: a.image,
      totalValue: Number(a.totalValue),
      minInvestment: Number(a.minInvestment),
      expectedRoi: Number(a.expectedRoi),
      status: a.status,
      riskLevel: a.riskLevel,
      fundingProgress: Number(a.fundingProgress || 0),
      fundedAmount: Number(a.fundedAmount || 0),
      createdAt: a.createdAt,
      tags: a.metadata?.tags || [],
      approvalStatus: a.metadata?.approvalStatus || "approved",
      flags: [],
    }));

    return { assets, total: count ?? assets.length };
  } catch (error) {
    console.error("Error fetching cross-module assets, returning mock data:", error);
    const mockAssets = getMockCrossModuleAssets();
    return { assets: mockAssets, total: mockAssets.length };
  }
}

export async function getAssetsByCategory(): Promise<AssetCategoryGroup[]> {
  try {
    const { data: categories, error: catError } = await supabaseClient
      .from("asset_categories")
      .select("*");
    const { data: assets, error: assetError } = await supabaseClient
      .from("assets")
      .select("*");

    if (catError || assetError) throw new Error("Database query failed");
    if (!categories || categories.length === 0) return getMockCategoryGroups();

    return categories.map((cat: any) => {
      const catAssets = (assets || []).filter(
        (a: any) => Number(a.categoryId) === Number(cat.id)
      );
      const totalValue = catAssets.reduce(
        (sum: number, a: any) => sum + Number(a.totalValue || 0),
        0
      );
      const totalRoi = catAssets.reduce(
        (sum: number, a: any) => sum + Number(a.expectedRoi || 0),
        0
      );

      return {
        categoryId: Number(cat.id),
        categoryName: cat.name,
        categorySlug: cat.slug,
        assetCount: catAssets.length,
        totalValue,
        averageRoi: catAssets.length > 0 ? totalRoi / catAssets.length : 0,
        assets: catAssets.map((a: any) => ({
          id: Number(a.id),
          name: a.name,
          slug: a.slug,
          module: cat.slug,
          categoryId: Number(a.categoryId),
          categoryName: cat.name,
          description: a.description,
          location: a.location,
          image: a.image,
          totalValue: Number(a.totalValue),
          minInvestment: Number(a.minInvestment),
          expectedRoi: Number(a.expectedRoi),
          status: a.status,
          riskLevel: a.riskLevel,
          fundingProgress: Number(a.fundingProgress || 0),
          fundedAmount: Number(a.fundedAmount || 0),
          createdAt: a.createdAt,
          tags: a.metadata?.tags || [],
          approvalStatus: a.metadata?.approvalStatus || "approved",
        })),
      };
    });
  } catch (error) {
    console.error("Error fetching assets by category, returning mock data:", error);
    return getMockCategoryGroups();
  }
}

export async function fetchPendingApprovalAssets(
  valueThreshold: number = 10000000
): Promise<CrossModuleAsset[]> {
  try {
    const { data, error } = await supabaseClient
      .from("assets")
      .select("*, asset_categories(name, slug)")
      .gte("totalValue", valueThreshold)
      .order("totalValue", { ascending: false });

    if (error) throw error;
    if (!data || data.length === 0) return getMockPendingAssets();

    const pending = data
      .filter(
        (a: any) =>
          !a.metadata?.approvalStatus || a.metadata.approvalStatus === "pending_review"
      )
      .map((a: any) => ({
        id: Number(a.id),
        name: a.name,
        slug: a.slug,
        module: a.asset_categories?.slug || "unknown",
        categoryId: Number(a.categoryId),
        categoryName: a.asset_categories?.name || "Unknown",
        description: a.description,
        location: a.location,
        image: a.image,
        totalValue: Number(a.totalValue),
        minInvestment: Number(a.minInvestment),
        expectedRoi: Number(a.expectedRoi),
        status: a.status,
        riskLevel: a.riskLevel,
        fundingProgress: Number(a.fundingProgress || 0),
        fundedAmount: Number(a.fundedAmount || 0),
        createdAt: a.createdAt,
        tags: a.metadata?.tags || [],
        approvalStatus: "pending_review" as AssetApprovalStatus,
      }));

    return pending.length > 0 ? pending : getMockPendingAssets();
  } catch (error) {
    console.error("Error fetching pending approval assets, returning mock data:", error);
    return getMockPendingAssets();
  }
}

/**
 * Approve or reject a high-value asset.
 * Updates the asset's metadata with the approval decision and logs the review.
 */
export async function reviewHighValueAsset(
  assetId: number,
  decision: "approved" | "rejected",
  reviewedBy: string | number,
  reviewNotes?: string
): Promise<boolean> {
  try {
    // 1. Fetch current asset metadata
    const { data: asset, error: fetchError } = await supabaseClient
      .from("assets")
      .select("name, metadata")
      .eq("id", assetId)
      .single();

    if (fetchError) throw fetchError;

    const currentMetadata = asset?.metadata || {};
    const previousStatus = currentMetadata.approvalStatus || "pending_review";

    // 2. Update asset metadata with approval status
    const updatedMetadata = {
      ...currentMetadata,
      approvalStatus: decision,
      reviewedBy: String(reviewedBy),
      reviewedAt: new Date().toISOString(),
      reviewNotes: reviewNotes || null,
    };

    const { error: updateError } = await supabaseClient
      .from("assets")
      .update({
        metadata: updatedMetadata,
        // If rejected, pause the asset
        ...(decision === "rejected" ? { status: "paused" } : {}),
      })
      .eq("id", assetId);

    if (updateError) throw updateError;

    // 3. Log the approval record
    await supabaseClient.from("asset_approval_logs").insert({
      assetId,
      assetName: asset?.name || `Asset #${assetId}`,
      previousStatus,
      newStatus: decision,
      reviewedBy: String(reviewedBy),
      reviewNotes: reviewNotes || null,
      reviewedAt: new Date().toISOString(),
    });

    return true;
  } catch (error) {
    console.error(`Error reviewing asset ${assetId}:`, error);
    return false;
  }
}


export async function fetchApprovalHistory(
  assetId?: number
): Promise<AssetApprovalRecord[]> {
  try {
    let query = supabaseClient
      .from("asset_approval_logs")
      .select("*")
      .order("reviewedAt", { ascending: false });

    if (assetId) {
      query = query.eq("assetId", assetId);
    }

    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) return getMockApprovalHistory();

    return data as AssetApprovalRecord[];
  } catch (error) {
    console.error("Error fetching approval history, returning mock data:", error);
    return getMockApprovalHistory();
  }
}

export async function flagAsset(
  assetId: number,
  flagType: AssetFlagType,
  reason: string,
  flaggedBy: string | number,
  metadata?: Record<string, any>
): Promise<AssetFlag | null> {
  try {
    const { data, error } = await supabaseClient
      .from("asset_flags")
      .insert({
        assetId,
        flagType,
        reason,
        flaggedBy: String(flaggedBy),
        flaggedAt: new Date().toISOString(),
        isResolved: false,
        metadata: metadata || {},
      })
      .select()
      .single();

    if (error) throw error;

    // Also update the asset metadata to indicate it's flagged
    const { data: asset } = await supabaseClient
      .from("assets")
      .select("metadata")
      .eq("id", assetId)
      .single();

    const currentMetadata = asset?.metadata || {};
    const currentFlags = currentMetadata.activeFlags || 0;

    await supabaseClient
      .from("assets")
      .update({
        metadata: {
          ...currentMetadata,
          isFlagged: true,
          activeFlags: currentFlags + 1,
          lastFlaggedAt: new Date().toISOString(),
        },
      })
      .eq("id", assetId);

    return data as AssetFlag;
  } catch (error) {
    console.error(`Error flagging asset ${assetId}:`, error);
    return null;
  }
}


export async function resolveAssetFlag(
  flagId: number,
  resolvedBy: string | number
): Promise<boolean> {
  try {
    // Get the flag to find the asset ID
    const { data: flag, error: fetchError } = await supabaseClient
      .from("asset_flags")
      .select("assetId")
      .eq("id", flagId)
      .single();

    if (fetchError) throw fetchError;

    // Mark the flag as resolved
    const { error: updateError } = await supabaseClient
      .from("asset_flags")
      .update({
        isResolved: true,
        resolvedBy: String(resolvedBy),
        resolvedAt: new Date().toISOString(),
      })
      .eq("id", flagId);

    if (updateError) throw updateError;

    // Update asset metadata: decrement active flags
    if (flag) {
      const { data: asset } = await supabaseClient
        .from("assets")
        .select("metadata")
        .eq("id", flag.assetId)
        .single();

      const currentMetadata = asset?.metadata || {};
      const activeFlags = Math.max(0, (currentMetadata.activeFlags || 1) - 1);

      await supabaseClient
        .from("assets")
        .update({
          metadata: {
            ...currentMetadata,
            activeFlags,
            isFlagged: activeFlags > 0,
          },
        })
        .eq("id", flag.assetId);
    }

    return true;
  } catch (error) {
    console.error(`Error resolving flag ${flagId}:`, error);
    return false;
  }
}


export async function fetchFlaggedAssets(): Promise<
  (CrossModuleAsset & { flags: AssetFlag[] })[]
> {
  try {
    const { data: flags, error: flagError } = await supabaseClient
      .from("asset_flags")
      .select("*")
      .eq("isResolved", false)
      .order("flaggedAt", { ascending: false });

    if (flagError) throw flagError;
    if (!flags || flags.length === 0) return getMockFlaggedAssets();

    // Group flags by assetId
    const flagsByAsset = new Map<number, AssetFlag[]>();
    flags.forEach((f: any) => {
      const assetId = Number(f.assetId);
      if (!flagsByAsset.has(assetId)) flagsByAsset.set(assetId, []);
      flagsByAsset.get(assetId)!.push(f as AssetFlag);
    });

    // Fetch the flagged assets
    const assetIds = [...flagsByAsset.keys()];
    const { data: assets, error: assetError } = await supabaseClient
      .from("assets")
      .select("*, asset_categories(name, slug)")
      .in("id", assetIds);

    if (assetError) throw assetError;
    if (!assets || assets.length === 0) return getMockFlaggedAssets();

    return assets.map((a: any) => ({
      id: Number(a.id),
      name: a.name,
      slug: a.slug,
      module: a.asset_categories?.slug || "unknown",
      categoryId: Number(a.categoryId),
      categoryName: a.asset_categories?.name || "Unknown",
      description: a.description,
      location: a.location,
      image: a.image,
      totalValue: Number(a.totalValue),
      minInvestment: Number(a.minInvestment),
      expectedRoi: Number(a.expectedRoi),
      status: a.status,
      riskLevel: a.riskLevel,
      fundingProgress: Number(a.fundingProgress || 0),
      fundedAmount: Number(a.fundedAmount || 0),
      createdAt: a.createdAt,
      tags: a.metadata?.tags || [],
      approvalStatus: a.metadata?.approvalStatus || "approved",
      flags: flagsByAsset.get(Number(a.id)) || [],
    }));
  } catch (error) {
    console.error("Error fetching flagged assets, returning mock data:", error);
    return getMockFlaggedAssets();
  }
}


export async function fetchAllTags(): Promise<AssetTag[]> {
  try {
    const { data, error } = await supabaseClient
      .from("asset_tags")
      .select("*")
      .order("name", { ascending: true });

    if (error) throw error;
    if (!data || data.length === 0) return getMockTags();

    return data as AssetTag[];
  } catch (error) {
    console.error("Error fetching tags, returning mock data:", error);
    return getMockTags();
  }
}


export async function createTag(tag: Omit<AssetTag, "id" | "assetCount">): Promise<AssetTag | null> {
  try {
    const { data, error } = await supabaseClient
      .from("asset_tags")
      .insert({
        name: tag.name,
        slug: tag.slug,
        color: tag.color || "#6366f1",
        description: tag.description || null,
      })
      .select()
      .single();

    if (error) throw error;
    return data as AssetTag;
  } catch (error) {
    console.error("Error creating tag:", error);
    return null;
  }
}

/ Deleting a tag
export async function deleteTag(tagId: number): Promise<boolean> {
  try {
    // Remove tag from all assets first
    const { data: tagData } = await supabaseClient
      .from("asset_tags")
      .select("slug")
      .eq("id", tagId)
      .single();

    if (tagData) {
      // Remove this tag from any asset metadata that contains it
      const { data: assets } = await supabaseClient
        .from("assets")
        .select("id, metadata");

      if (assets) {
        for (const asset of assets) {
          const meta = asset.metadata || {};
          const tags: string[] = meta.tags || [];
          if (tags.includes(tagData.slug)) {
            const updatedTags = tags.filter((t: string) => t !== tagData.slug);
            await supabaseClient
              .from("assets")
              .update({ metadata: { ...meta, tags: updatedTags } })
              .eq("id", asset.id);
          }
        }
      }
    }

    const { error } = await supabaseClient
      .from("asset_tags")
      .delete()
      .eq("id", tagId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error(`Error deleting tag ${tagId}:`, error);
    return false;
  }
}

export async function assignTagsToAsset(
  assetId: number,
  tagSlugs: string[]
): Promise<boolean> {
  try {
    const { data: asset, error: fetchError } = await supabaseClient
      .from("assets")
      .select("metadata")
      .eq("id", assetId)
      .single();

    if (fetchError) throw fetchError;

    const currentMetadata = asset?.metadata || {};
    const updatedMetadata = {
      ...currentMetadata,
      tags: tagSlugs,
    };

    const { error } = await supabaseClient
      .from("assets")
      .update({ metadata: updatedMetadata })
      .eq("id", assetId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error(`Error assigning tags to asset ${assetId}:`, error);
    return false;
  }
}


export async function addTagToAsset(
  assetId: number,
  tagSlug: string
): Promise<boolean> {
  try {
    const { data: asset, error: fetchError } = await supabaseClient
      .from("assets")
      .select("metadata")
      .eq("id", assetId)
      .single();

    if (fetchError) throw fetchError;

    const currentMetadata = asset?.metadata || {};
    const existingTags: string[] = currentMetadata.tags || [];

    if (existingTags.includes(tagSlug)) return true; // Already tagged

    const updatedMetadata = {
      ...currentMetadata,
      tags: [...existingTags, tagSlug],
    };

    const { error } = await supabaseClient
      .from("assets")
      .update({ metadata: updatedMetadata })
      .eq("id", assetId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error(`Error adding tag to asset ${assetId}:`, error);
    return false;
  }
}

/**
 * Remove a single tag from an asset.
 */
export async function removeTagFromAsset(
  assetId: number,
  tagSlug: string
): Promise<boolean> {
  try {
    const { data: asset, error: fetchError } = await supabaseClient
      .from("assets")
      .select("metadata")
      .eq("id", assetId)
      .single();

    if (fetchError) throw fetchError;

    const currentMetadata = asset?.metadata || {};
    const existingTags: string[] = currentMetadata.tags || [];

    const updatedMetadata = {
      ...currentMetadata,
      tags: existingTags.filter((t) => t !== tagSlug),
    };

    const { error } = await supabaseClient
      .from("assets")
      .update({ metadata: updatedMetadata })
      .eq("id", assetId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error(`Error removing tag from asset ${assetId}:`, error);
    return false;
  }
}

/**
 * Fetch assets filtered by a specific tag.
 */
export async function fetchAssetsByTag(
  tagSlug: string
): Promise<CrossModuleAsset[]> {
  try {
    const { data, error } = await supabaseClient
      .from("assets")
      .select("*, asset_categories(name, slug)")
      .contains("metadata", { tags: [tagSlug] });

    if (error) throw error;
    if (!data || data.length === 0) return [];

    return data.map((a: any) => ({
      id: Number(a.id),
      name: a.name,
      slug: a.slug,
      module: a.asset_categories?.slug || "unknown",
      categoryId: Number(a.categoryId),
      categoryName: a.asset_categories?.name || "Unknown",
      description: a.description,
      location: a.location,
      image: a.image,
      totalValue: Number(a.totalValue),
      minInvestment: Number(a.minInvestment),
      expectedRoi: Number(a.expectedRoi),
      status: a.status,
      riskLevel: a.riskLevel,
      fundingProgress: Number(a.fundingProgress || 0),
      fundedAmount: Number(a.fundedAmount || 0),
      createdAt: a.createdAt,
      tags: a.metadata?.tags || [],
      approvalStatus: a.metadata?.approvalStatus || "approved",
    }));
  } catch (error) {
    console.error(`Error fetching assets by tag "${tagSlug}":`, error);
    return [];
  }
}

/**
 * Re-categorize an asset (move it to a different category).
 */
export async function recategorizeAsset(
  assetId: number,
  newCategoryId: number
): Promise<boolean> {
  try {
    const { error } = await supabaseClient
      .from("assets")
      .update({ categoryId: newCategoryId })
      .eq("id", assetId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error(`Error recategorizing asset ${assetId}:`, error);
    return false;
  }
}


// Mock Data


function getMockCrossModuleAssets(): CrossModuleAsset[] {
  return [
    {
      id: 1,
      name: "Cyber City Commercial Tower",
      slug: "cyber-city-commercial-tower",
      module: "real-estate",
      categoryId: 1,
      categoryName: "Real Estate",
      description: "Premium Grade A commercial office space in the heart of Cyber City, Gurgaon.",
      location: "Cyber City, Gurgaon",
      image: "/assets/re-1.jpg",
      totalValue: 50000000,
      minInvestment: 500000,
      expectedRoi: 12.5,
      status: "active",
      riskLevel: "low",
      fundingProgress: 72.4,
      fundedAmount: 36200000,
      createdAt: "2024-01-15T00:00:00Z",
      tags: ["premium", "commercial", "grade-a"],
      approvalStatus: "approved",
    },
    {
      id: 2,
      name: "Palm Grove Residences",
      slug: "palm-grove-residences",
      module: "real-estate",
      categoryId: 1,
      categoryName: "Real Estate",
      description: "Luxury residential development in Whitefield, Bangalore.",
      location: "Whitefield, Bangalore",
      image: "/assets/re-2.jpg",
      totalValue: 75000000,
      minInvestment: 1000000,
      expectedRoi: 15.0,
      status: "active",
      riskLevel: "moderate",
      fundingProgress: 45.8,
      fundedAmount: 34350000,
      createdAt: "2024-03-01T00:00:00Z",
      tags: ["luxury", "residential"],
      approvalStatus: "approved",
    },
    {
      id: 3,
      name: "Invoice Pool - Manufacturing Batch A",
      slug: "invoice-pool-manufacturing-a",
      module: "invoice-financing",
      categoryId: 2,
      categoryName: "Invoice Financing",
      description: "Portfolio of 45-day invoices from established manufacturing SMEs.",
      location: "Multiple Locations",
      image: "/assets/inv-1.jpg",
      totalValue: 8000000,
      minInvestment: 100000,
      expectedRoi: 8.5,
      status: "active",
      riskLevel: "low",
      fundingProgress: 88.5,
      fundedAmount: 7080000,
      createdAt: "2025-01-10T00:00:00Z",
      tags: ["short-term", "manufacturing"],
      approvalStatus: "approved",
    },
    {
      id: 4,
      name: "LogiChain Working Capital Pool",
      slug: "logichain-working-capital-pool",
      module: "supply-chain-finance",
      categoryId: 3,
      categoryName: "Supply Chain Finance",
      description: "Pooled supply chain finance for 50+ logistics and warehousing SMEs.",
      location: "Pan India",
      image: "/assets/scf-1.jpg",
      totalValue: 20000000,
      minInvestment: 50000,
      expectedRoi: 9.8,
      status: "upcoming",
      riskLevel: "low",
      fundingProgress: 0,
      fundedAmount: 0,
      createdAt: "2026-06-01T00:00:00Z",
      tags: ["logistics", "working-capital"],
      approvalStatus: "pending_review",
    },
  ];
}

function getMockCategoryGroups(): AssetCategoryGroup[] {
  const allAssets = getMockCrossModuleAssets();
  return [
    {
      categoryId: 1,
      categoryName: "Real Estate",
      categorySlug: "real-estate",
      assetCount: 2,
      totalValue: 125000000,
      averageRoi: 13.75,
      assets: allAssets.filter((a) => a.categoryId === 1),
    },
    {
      categoryId: 2,
      categoryName: "Invoice Financing",
      categorySlug: "invoice-financing",
      assetCount: 1,
      totalValue: 8000000,
      averageRoi: 8.5,
      assets: allAssets.filter((a) => a.categoryId === 2),
    },
    {
      categoryId: 3,
      categoryName: "Supply Chain Finance",
      categorySlug: "supply-chain-finance",
      assetCount: 1,
      totalValue: 20000000,
      averageRoi: 9.8,
      assets: allAssets.filter((a) => a.categoryId === 3),
    },
  ];
}

function getMockPendingAssets(): CrossModuleAsset[] {
  return [
    {
      id: 5,
      name: "Marina Bay Waterfront Complex",
      slug: "marina-bay-waterfront-complex",
      module: "real-estate",
      categoryId: 1,
      categoryName: "Real Estate",
      description: "Ultra-luxury waterfront commercial and residential mixed-use development. Requires admin approval due to high asset value.",
      location: "Marine Drive, Mumbai",
      image: "/assets/re-3.jpg",
      totalValue: 150000000,
      minInvestment: 5000000,
      expectedRoi: 18.0,
      status: "upcoming",
      riskLevel: "high",
      fundingProgress: 0,
      fundedAmount: 0,
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      tags: ["ultra-luxury", "waterfront", "mixed-use"],
      approvalStatus: "pending_review",
    },
    {
      id: 6,
      name: "Pharma Invoice Mega Pool",
      slug: "pharma-invoice-mega-pool",
      module: "invoice-financing",
      categoryId: 2,
      categoryName: "Invoice Financing",
      description: "Large-scale 60-day invoice portfolio from top pharmaceutical companies. Pending compliance review.",
      location: "Hyderabad",
      image: "/assets/inv-2.jpg",
      totalValue: 25000000,
      minInvestment: 250000,
      expectedRoi: 10.5,
      status: "upcoming",
      riskLevel: "moderate",
      fundingProgress: 0,
      fundedAmount: 0,
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      tags: ["pharma", "large-pool"],
      approvalStatus: "pending_review",
    },
  ];
}

function getMockApprovalHistory(): AssetApprovalRecord[] {
  return [
    {
      id: 1,
      assetId: 1,
      assetName: "Cyber City Commercial Tower",
      previousStatus: "pending_review",
      newStatus: "approved",
      reviewedBy: "mock-uid-1",
      reviewNotes: "All due diligence documents verified. Approved for listing.",
      reviewedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 2,
      assetId: 2,
      assetName: "Palm Grove Residences",
      previousStatus: "pending_review",
      newStatus: "approved",
      reviewedBy: "mock-uid-1",
      reviewNotes: "Approved after title verification and RERA confirmation.",
      reviewedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 3,
      assetId: 7,
      assetName: "Suspicious Plot in Outskirts",
      previousStatus: "pending_review",
      newStatus: "rejected",
      reviewedBy: "mock-uid-1",
      reviewNotes: "Rejected — incomplete title documents and disputed land record.",
      reviewedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ];
}

function getMockFlaggedAssets(): (CrossModuleAsset & { flags: AssetFlag[] })[] {
  return [
    {
      id: 4,
      name: "LogiChain Working Capital Pool",
      slug: "logichain-working-capital-pool",
      module: "supply-chain-finance",
      categoryId: 3,
      categoryName: "Supply Chain Finance",
      description: "Pooled supply chain finance for 50+ logistics and warehousing SMEs.",
      location: "Pan India",
      image: "/assets/scf-1.jpg",
      totalValue: 20000000,
      minInvestment: 50000,
      expectedRoi: 9.8,
      status: "upcoming",
      riskLevel: "low",
      fundingProgress: 0,
      fundedAmount: 0,
      createdAt: "2026-06-01T00:00:00Z",
      tags: ["logistics", "working-capital"],
      approvalStatus: "pending_review",
      flags: [
        {
          id: 1,
          assetId: 4,
          flagType: "suspicious",
          reason: "Multiple SMEs in the pool have overlapping directors — potential circular financing risk.",
          flaggedBy: "mock-uid-1",
          flaggedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
          isResolved: false,
        },
      ],
    },
    {
      id: 8,
      name: "Unverified Land Plot - Tier 3",
      slug: "unverified-land-plot-tier3",
      module: "real-estate",
      categoryId: 1,
      categoryName: "Real Estate",
      description: "Agricultural land conversion plot in a Tier 3 city. Title chain incomplete.",
      location: "Nashik, Maharashtra",
      image: null,
      totalValue: 3500000,
      minInvestment: 50000,
      expectedRoi: 22.0,
      status: "paused",
      riskLevel: "high",
      fundingProgress: 0,
      fundedAmount: 0,
      createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      tags: [],
      approvalStatus: "pending_review",
      flags: [
        {
          id: 2,
          assetId: 8,
          flagType: "invalid",
          reason: "Title chain documents are incomplete — missing encumbrance certificate.",
          flaggedBy: "mock-uid-1",
          flaggedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
          isResolved: false,
        },
        {
          id: 3,
          assetId: 8,
          flagType: "compliance",
          reason: "Agricultural land conversion approval not yet received from collector's office.",
          flaggedBy: "system",
          flaggedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
          isResolved: false,
        },
      ],
    },
  ];
}

function getMockTags(): AssetTag[] {
  return [
    { id: 1, name: "Premium", slug: "premium", color: "#8b5cf6", description: "High-value premium assets", assetCount: 1 },
    { id: 2, name: "Commercial", slug: "commercial", color: "#3b82f6", description: "Commercial real estate", assetCount: 1 },
    { id: 3, name: "Grade A", slug: "grade-a", color: "#10b981", description: "Grade A certified properties", assetCount: 1 },
    { id: 4, name: "Luxury", slug: "luxury", color: "#f59e0b", description: "Luxury segment", assetCount: 1 },
    { id: 5, name: "Residential", slug: "residential", color: "#ec4899", description: "Residential properties", assetCount: 1 },
    { id: 6, name: "Short Term", slug: "short-term", color: "#06b6d4", description: "Short duration investments", assetCount: 1 },
    { id: 7, name: "Manufacturing", slug: "manufacturing", color: "#64748b", description: "Manufacturing sector assets", assetCount: 1 },
    { id: 8, name: "Logistics", slug: "logistics", color: "#f97316", description: "Logistics and warehousing", assetCount: 1 },
    { id: 9, name: "Working Capital", slug: "working-capital", color: "#14b8a6", description: "Working capital financing", assetCount: 1 },
    { id: 10, name: "High Risk", slug: "high-risk", color: "#ef4444", description: "High risk investments", assetCount: 0 },
  ];
}
