/**
 * Campaign types aligned with existing follow-up architecture
 * (FollowUpCampaign, FollowUpRecipient, FollowUpRecipientStep, smtpConfig)
 */

export type CampaignStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "RUNNING"
  | "PAUSED"
  | "COMPLETED"
  | "CANCELLED";

export type RecipientStatus =
  | "PENDING"
  | "SCHEDULED"
  | "SENDING"
  | "SENT"
  | "FAILED"
  | "COMPLETED"
  | "PAUSED"
  | "SKIPPED";

export type IntervalUnit = "seconds" | "minutes" | "hours" | "days";

export interface SmtpAccount {
  id: string;
  name?: string | null;
  email: string;
  host: string;
  port: number;
  username: string;
  fromName?: string | null;
  isActive?: boolean;
  lastTestedAt?: string | null;
  // password is NEVER exposed to the frontend
}

export interface ContactRecord {
  id: string;
  name?: string | null;
  email: string;
  company?: string | null;
  website?: string | null;
  status?: string | null;
  createdAt?: string;
}

export interface CampaignStep {
  id?: string;
  stepNumber: number;
  subject: string;
  body: string;
  delayDays: number;
  delayHours?: number;
  enabled: boolean;
}

export interface CampaignRecipient {
  id: string;
  contactId?: string;
  name?: string | null;
  email: string;
  company?: string | null;
  website?: string | null;
  status: RecipientStatus;
  currentStep: number;
  sentAt?: string | null;
  nextSendAt?: string | null;
  error?: string | null;
  messageId?: string | null;
}

export interface CampaignStats {
  total: number;
  sent: number;
  pending: number;
  sending: number;
  failed: number;
  completed: number;
  remaining: number;
  todaySent: number;
  dailyLimit: number;
  dailyRemaining: number;
}

export interface Campaign {
  id: string;
  name: string;
  status: CampaignStatus;
  smtpConfigId: string;
  smtpConfig?: SmtpAccount;
  subject: string;
  body: string;
  greetingEnabled: boolean;
  spinTextEnabled: boolean;
  intervalValue: number;
  intervalUnit: IntervalUnit;
  dailyLimit: number;
  scheduledAt?: string | null;
  timezone?: string | null;
  sendingStart?: string | null;
  sendingEnd?: string | null;
  steps: CampaignStep[];
  recipients: CampaignRecipient[];
  stats: CampaignStats;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
}

export interface CreateCampaignPayload {
  name: string;
  smtpConfigId: string;
  subject: string;
  body: string;
  greetingEnabled: boolean;
  spinTextEnabled: boolean;
  intervalValue: number;
  intervalUnit: IntervalUnit;
  dailyLimit: number;
  scheduledAt?: string | null;
  timezone?: string;
  steps: Omit<CampaignStep, "id">[];
  recipientIds: string[]; // existing contact IDs
  recipientEmails?: { email: string; name?: string; company?: string; website?: string }[];
}

export interface UpdateCampaignStatusPayload {
  status: "RUNNING" | "PAUSED" | "CANCELLED";
}