import { supabase as supabaseClient } from "@/lib/supabaseClient";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type AnnouncementPriority = "low" | "normal" | "high" | "critical";
export type AnnouncementChannel = "in_app" | "email" | "sms" | "push" | "all";
export type AlertSeverity = "info" | "warning" | "error" | "critical";
export type AlertStatus = "active" | "acknowledged" | "resolved" | "expired";

export interface BroadcastAnnouncement {
  id?: number;
  title: string;
  message: string;
  priority: AnnouncementPriority;
  channels: AnnouncementChannel[];
  targetAudience: "all_users" | "all_businesses" | "all";
  scheduledAt?: string;
  expiresAt?: string;
  createdBy: string | number;
  createdAt?: string;
  metadata?: Record<string, any>;
}

export interface TargetedNotification {
  id?: number;
  recipientIds: number[];
  recipientType: "user" | "business";
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
  actionUrl?: string;
  actionLabel?: string;
  isRead?: boolean;
  createdBy: string | number;
  createdAt?: string;
  metadata?: Record<string, any>;
}

export interface SystemAlert {
  id?: number;
  title: string;
  message: string;
  severity: AlertSeverity;
  status: AlertStatus;
  affectedModule?: string;
  acknowledgedBy?: string | number;
  acknowledgedAt?: string;
  resolvedBy?: string | number;
  resolvedAt?: string;
  createdBy: string | number;
  createdAt?: string;
  metadata?: Record<string, any>;
}

// ─────────────────────────────────────────────────────────────
// 1. Broadcast Announcements to All Users
// ─────────────────────────────────────────────────────────────

/**
 * Broadcast an announcement to all users, all businesses, or everyone.
 * Inserts a record into the `announcements` table and then fans-out
 * individual notifications to each target user.
 */
export async function broadcastAnnouncement(
  announcement: Omit<BroadcastAnnouncement, "id" | "createdAt">
): Promise<BroadcastAnnouncement | null> {
  try {
    // 1. Persist the announcement
    const { data: saved, error: saveError } = await supabaseClient
      .from("announcements")
      .insert({
        title: announcement.title,
        message: announcement.message,
        priority: announcement.priority,
        channels: announcement.channels,
        targetAudience: announcement.targetAudience,
        scheduledAt: announcement.scheduledAt || null,
        expiresAt: announcement.expiresAt || null,
        createdBy: String(announcement.createdBy),
        createdAt: new Date().toISOString(),
        metadata: announcement.metadata || {},
      })
      .select()
      .single();

    if (saveError) throw saveError;

    // 2. Determine recipient pool
    let recipientIds: number[] = [];

    if (
      announcement.targetAudience === "all_users" ||
      announcement.targetAudience === "all"
    ) {
      const { data: users, error: usersError } = await supabaseClient
        .from("users")
        .select("id");
      if (!usersError && users) {
        recipientIds = recipientIds.concat(users.map((u) => Number(u.id)));
      }
    }

    if (
      announcement.targetAudience === "all_businesses" ||
      announcement.targetAudience === "all"
    ) {
      const { data: businesses, error: bizError } = await supabaseClient
        .from("businesses")
        .select("userId");
      if (!bizError && businesses) {
        const bizUserIds = businesses.map((b) => Number(b.userId));
        recipientIds = recipientIds.concat(bizUserIds);
      }
    }

    // De-duplicate
    recipientIds = [...new Set(recipientIds)];

    // 3. Fan-out individual notifications (batch insert)
    if (recipientIds.length > 0) {
      const rows = recipientIds.map((uid) => ({
        userId: uid,
        title: announcement.title,
        message: announcement.message,
        type: announcement.priority === "critical" ? "error" : "info",
        isRead: false,
        metadata: {
          announcementId: saved?.id,
          priority: announcement.priority,
          channels: announcement.channels,
        },
        createdAt: new Date().toISOString(),
      }));

      await supabaseClient.from("notifications").insert(rows);
    }

    return saved as BroadcastAnnouncement;
  } catch (error) {
    console.error("Error broadcasting announcement:", error);
    return null;
  }
}

/**
 * Fetch all announcements, optionally filtering by audience.
 */
export async function fetchAnnouncements(
  targetAudience?: BroadcastAnnouncement["targetAudience"]
): Promise<BroadcastAnnouncement[]> {
  try {
    let query = supabaseClient
      .from("announcements")
      .select("*")
      .order("createdAt", { ascending: false });

    if (targetAudience) {
      query = query.eq("targetAudience", targetAudience);
    }

    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) return getMockAnnouncements();

    return data as BroadcastAnnouncement[];
  } catch (error) {
    console.error("Error fetching announcements, returning mock data:", error);
    return getMockAnnouncements();
  }
}

/**
 * Delete / revoke an announcement and mark related notifications as expired.
 */
export async function revokeAnnouncement(announcementId: number): Promise<boolean> {
  try {
    const { error: deleteError } = await supabaseClient
      .from("announcements")
      .delete()
      .eq("id", announcementId);

    if (deleteError) throw deleteError;

    // Mark fan-out notifications as read
    await supabaseClient
      .from("notifications")
      .update({ isRead: true })
      .eq("metadata->>announcementId", String(announcementId));

    return true;
  } catch (error) {
    console.error(`Error revoking announcement ${announcementId}:`, error);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// 2. Notify Specific Users or Businesses
// ─────────────────────────────────────────────────────────────

/**
 * Send a targeted notification to a list of specific users.
 */
export async function notifySpecificUsers(
  notification: Omit<TargetedNotification, "id" | "createdAt" | "isRead" | "recipientType"> & {
    recipientType?: "user";
  }
): Promise<boolean> {
  try {
    const rows = notification.recipientIds.map((uid) => ({
      userId: uid,
      title: notification.title,
      message: notification.message,
      type: notification.type,
      isRead: false,
      metadata: {
        actionUrl: notification.actionUrl || null,
        actionLabel: notification.actionLabel || null,
        createdBy: notification.createdBy,
        recipientType: "user",
        ...notification.metadata,
      },
      createdAt: new Date().toISOString(),
    }));

    const { error } = await supabaseClient.from("notifications").insert(rows);
    if (error) throw error;

    return true;
  } catch (error) {
    console.error("Error notifying specific users:", error);
    return false;
  }
}

/**
 * Send a targeted notification to one or more businesses (by business ID).
 * Resolves business → userId mapping first, then inserts notifications.
 */
export async function notifySpecificBusinesses(
  businessIds: number[],
  notification: {
    title: string;
    message: string;
    type: "info" | "success" | "warning" | "error";
    actionUrl?: string;
    actionLabel?: string;
    createdBy: string | number;
    metadata?: Record<string, any>;
  }
): Promise<boolean> {
  try {
    // Resolve business → user mapping
    const { data: businesses, error: bizError } = await supabaseClient
      .from("businesses")
      .select("id, userId, name")
      .in("id", businessIds);

    if (bizError) throw bizError;
    if (!businesses || businesses.length === 0) {
      console.warn("No businesses found for the given IDs.");
      return false;
    }

    const rows = businesses.map((biz) => ({
      userId: Number(biz.userId),
      title: notification.title,
      message: notification.message,
      type: notification.type,
      isRead: false,
      metadata: {
        recipientType: "business",
        businessId: biz.id,
        businessName: biz.name,
        actionUrl: notification.actionUrl || null,
        actionLabel: notification.actionLabel || null,
        createdBy: notification.createdBy,
        ...notification.metadata,
      },
      createdAt: new Date().toISOString(),
    }));

    const { error } = await supabaseClient.from("notifications").insert(rows);
    if (error) throw error;

    return true;
  } catch (error) {
    console.error("Error notifying specific businesses:", error);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// 3. System Alerts and Updates
// ─────────────────────────────────────────────────────────────

/**
 * Create a new system-level alert (e.g. maintenance window, outage, update).
 */
export async function createSystemAlert(
  alert: Omit<SystemAlert, "id" | "createdAt" | "status">
): Promise<SystemAlert | null> {
  try {
    const { data, error } = await supabaseClient
      .from("system_alerts")
      .insert({
        title: alert.title,
        message: alert.message,
        severity: alert.severity,
        status: "active" as AlertStatus,
        affectedModule: alert.affectedModule || null,
        createdBy: String(alert.createdBy),
        createdAt: new Date().toISOString(),
        metadata: alert.metadata || {},
      })
      .select()
      .single();

    if (error) throw error;
    return data as SystemAlert;
  } catch (error) {
    console.error("Error creating system alert:", error);
    return null;
  }
}

/**
 * Fetch all system alerts, optionally filtering by status or severity.
 */
export async function fetchSystemAlerts(filters?: {
  status?: AlertStatus;
  severity?: AlertSeverity;
}): Promise<SystemAlert[]> {
  try {
    let query = supabaseClient
      .from("system_alerts")
      .select("*")
      .order("createdAt", { ascending: false });

    if (filters?.status) {
      query = query.eq("status", filters.status);
    }
    if (filters?.severity) {
      query = query.eq("severity", filters.severity);
    }

    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) return getMockSystemAlerts();

    return data as SystemAlert[];
  } catch (error) {
    console.error("Error fetching system alerts, returning mock data:", error);
    return getMockSystemAlerts();
  }
}

/**
 * Acknowledge a system alert (marks it as seen by an admin).
 */
export async function acknowledgeSystemAlert(
  alertId: number,
  adminId: string | number
): Promise<boolean> {
  try {
    const { error } = await supabaseClient
      .from("system_alerts")
      .update({
        status: "acknowledged" as AlertStatus,
        acknowledgedBy: String(adminId),
        acknowledgedAt: new Date().toISOString(),
      })
      .eq("id", alertId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error(`Error acknowledging system alert ${alertId}:`, error);
    return false;
  }
}

/**
 * Resolve a system alert (marks it as resolved).
 */
export async function resolveSystemAlert(
  alertId: number,
  adminId: string | number
): Promise<boolean> {
  try {
    const { error } = await supabaseClient
      .from("system_alerts")
      .update({
        status: "resolved" as AlertStatus,
        resolvedBy: String(adminId),
        resolvedAt: new Date().toISOString(),
      })
      .eq("id", alertId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error(`Error resolving system alert ${alertId}:`, error);
    return false;
  }
}

/**
 * Delete a system alert permanently.
 */
export async function deleteSystemAlert(alertId: number): Promise<boolean> {
  try {
    const { error } = await supabaseClient
      .from("system_alerts")
      .delete()
      .eq("id", alertId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error(`Error deleting system alert ${alertId}:`, error);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// Mock Data
// ─────────────────────────────────────────────────────────────

function getMockAnnouncements(): BroadcastAnnouncement[] {
  return [
    {
      id: 1,
      title: "Platform Maintenance Scheduled",
      message:
        "We will be performing scheduled maintenance on June 5, 2026 from 2:00 AM to 4:00 AM IST. During this time, the platform may be temporarily unavailable.",
      priority: "high",
      channels: ["in_app", "email"],
      targetAudience: "all",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      createdBy: "mock-uid-1",
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      metadata: {},
    },
    {
      id: 2,
      title: "New Asset Category: Green Energy Bonds",
      message:
        "We are excited to announce the launch of Green Energy Bonds on our platform. Explore sustainable investment opportunities with attractive returns.",
      priority: "normal",
      channels: ["in_app", "email", "push"],
      targetAudience: "all_users",
      createdBy: "mock-uid-1",
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      metadata: { category: "product_launch" },
    },
    {
      id: 3,
      title: "KYC Verification Deadline",
      message:
        "All businesses must complete KYC verification by June 30, 2026 to continue operating on the platform. Please ensure all documents are uploaded.",
      priority: "critical",
      channels: ["in_app", "email", "sms"],
      targetAudience: "all_businesses",
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      createdBy: "mock-uid-1",
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      metadata: { category: "compliance" },
    },
  ];
}

function getMockSystemAlerts(): SystemAlert[] {
  return [
    {
      id: 1,
      title: "Payment Gateway Latency Detected",
      message:
        "Increased response times observed from Razorpay payment gateway. Average latency has increased from 200ms to 1.2s. Monitoring closely.",
      severity: "warning",
      status: "active",
      affectedModule: "payments",
      createdBy: "system",
      createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      metadata: { avgLatencyMs: 1200, normalLatencyMs: 200 },
    },
    {
      id: 2,
      title: "Database Storage at 82%",
      message:
        "Primary Supabase database storage utilization has reached 82%. Consider archiving old records or upgrading the plan.",
      severity: "info",
      status: "acknowledged",
      affectedModule: "database",
      acknowledgedBy: "mock-uid-1",
      acknowledgedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      createdBy: "system",
      createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
      metadata: { storagePercent: 82 },
    },
    {
      id: 3,
      title: "SSL Certificate Renewal Due",
      message:
        "The SSL certificate for api.sovriigne.com expires on July 15, 2026. Auto-renewal is configured but please verify.",
      severity: "critical",
      status: "active",
      affectedModule: "infrastructure",
      createdBy: "system",
      createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      metadata: { expiryDate: "2026-07-15" },
    },
  ];
}
