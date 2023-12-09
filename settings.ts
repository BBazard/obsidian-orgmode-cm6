export interface OrgmodePluginSettings {
  todoKeywords: string[];
  doneKeywords: string[];
}

export const DEFAULT_SETTINGS: OrgmodePluginSettings = {
  todoKeywords: ["TODO", "LATER", "WAITING", "DEFERRED", "SOMEDAY", "PROJECT"],
  doneKeywords: ["DONE", "CANCELLED"],
};
