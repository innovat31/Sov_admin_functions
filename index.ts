/**
 * Admin Functions 2 — Extended Admin Service Layer
 *
 * This module provides additional admin capabilities beyond the core
 * admin_function services:
 *
 * 1. Communication & Control (communication_service)
 *    - Broadcast announcements to all users
 *    - Notify specific users or businesses
 *    - System alerts and updates
 *
 * 2. Asset Oversight (asset_oversight_service)
 *    - View all assets across all modules
 *    - Approve or reject high-value assets
 *    - Flag suspicious or invalid assets
 *    - Categorization and tagging of assets
 */

// ── Communication & Control ──────────────────────────────────
export {
  // Types
  type AnnouncementPriority,
  type AnnouncementChannel,
  type AlertSeverity,
  type AlertStatus,
  type BroadcastAnnouncement,
  type TargetedNotification,
  type SystemAlert,

  // Broadcast
  broadcastAnnouncement,
  fetchAnnouncements,
  revokeAnnouncement,

  // Targeted Notifications
  notifySpecificUsers,
  notifySpecificBusinesses,

  // System Alerts
  createSystemAlert,
  fetchSystemAlerts,
  acknowledgeSystemAlert,
  resolveSystemAlert,
  deleteSystemAlert,
} from "./communication_service";

// ── Asset Oversight ──────────────────────────────────────────
export {
  // Types
  type AssetApprovalStatus,
  type AssetFlagType,
  type AssetModule,
  type CrossModuleAsset,
  type AssetFlag,
  type AssetApprovalRecord,
  type AssetTag,
  type AssetCategoryGroup,

  // Cross-Module Viewing
  fetchAllCrossModuleAssets,
  getAssetsByCategory,

  // Approval Workflow
  fetchPendingApprovalAssets,
  reviewHighValueAsset,
  fetchApprovalHistory,

  // Flagging
  flagAsset,
  resolveAssetFlag,
  fetchFlaggedAssets,

  // Tagging & Categorization
  fetchAllTags,
  createTag,
  deleteTag,
  assignTagsToAsset,
  addTagToAsset,
  removeTagFromAsset,
  fetchAssetsByTag,
  recategorizeAsset,
} from "./asset_oversight_service";
