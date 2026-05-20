import { registerHandler } from "@qr-relay/core";
import { relayHandler } from "./relay.js";

registerHandler(relayHandler);

export { relayHandler } from "./relay.js";
export { presets, presetById, type Preset } from "./presets.js";
export {
  ScanRule,
  ScanRulePatch,
  mergeScanRule,
  type MergeScanRuleResult,
  type RelayState,
  type ValueSlot,
} from "./relay-rule.js";
