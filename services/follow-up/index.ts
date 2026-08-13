export * from "./follow-up.types";
export * from "./follow-up.service";
export {
  processDueFollowUps,
  sendCampaignEmail,
} from "./follow-up.scheduler";

export type {
  SendEmailPayload,
  SendEmailResult,
} from "./follow-up.scheduler";