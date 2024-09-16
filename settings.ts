export interface OrgmodePluginSettings {
  todoKeywords: string[];
  doneKeywords: string[];
  hideStars: boolean;
}

export const DEFAULT_SETTINGS: OrgmodePluginSettings = {
  todoKeywords: ["TODO", "DOING", "WAITING", "NEXT", "PENDING"],
  doneKeywords: ["DONE", "CANCELLED", "CANCELED", "CANCEL", "REJECTED", "STOP", "STOPPED"],
  hideStars: false,
};
