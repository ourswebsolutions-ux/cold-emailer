import type {
  FollowUpCampaign,
  FollowUpStep,
  FollowUpRecipient,
  FollowUpRecipientStep,
  FollowUpCampaignStatus,
  FollowUpRecipientStatus,
  FollowUpStepStatus,
  Email,
  SMTPConfig,
} from "@prisma/client";

export type IntervalUnit =
  | "seconds"
  | "minutes"
  | "hours"
  | "days";
export type CreateCampaignInput = {
  name: string;
  smtpConfigId?: string | null;
  campaignType: "EMAIL" | "FOLLOW_UP";
  stopOnReply?: boolean;
  timezone?: string;
  sendingStart?: string;
  sendingEnd?: string;
  scheduledAt?: string | Date | null;
   intervalValue?: number;
  intervalUnit?: IntervalUnit;
  dailyLimit?: number;
   greetingEnabled?: boolean;
  spinTextEnabled?: boolean;
  recipientEmailIds: string[];
  steps: Array<{
    stepNumber: number;
    delayDays: number;
    subject: string;
    body: string;
    enabled?: boolean;
  }>;
};

export type UpdateCampaignInput = {
  name?: string;
  smtpConfigId?: string | null;
  stopOnReply?: boolean;
  timezone?: string;
  sendingStart?: string;
  sendingEnd?: string;
  scheduledAt?: string | Date | null;
  status?: FollowUpCampaignStatus;
};

export type AddRecipientsInput = {
  campaignId: string;
  emailIds: string[];
};

export type CampaignStats = {
  total: number;
  pending: number;
  running: number;
  sent: number;
  replied: number;
  completed: number;
  failed: number;
  stopped: number;
  remaining: number;
  progress: number;
};

export type CampaignListItem = FollowUpCampaign & {
  steps: FollowUpStep[];
  _count: {
    recipients: number;
  };
  stats: CampaignStats;
};

export type CampaignDetail = FollowUpCampaign & {
  steps: FollowUpStep[];
  recipients: Array<
    FollowUpRecipient & {
      email: Email;
      steps: Array<
        FollowUpRecipientStep & {
          step: FollowUpStep;
        }
      >;
    }
  >;
  smtpConfig: SMTPConfig | null;
  stats: CampaignStats;
};

export type ProcessResult = {
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
  errors: Array<{ recipientStepId: string; error: string }>;
};

export type VariableContext = {
  name?: string | null;
  email: string;
  company?: string | null;
  website?: string | null;
};
