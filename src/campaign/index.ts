/**
 * The campaign layer.
 *
 * `robots.ts`, `targets.ts` and `aggregate.ts` are pure and are tested without a network.
 * `permission.ts` and `runner.ts` are the impure half: one fetch and one browser per site, in that
 * order, with a pause between sites that only ever gets longer.
 */

export {
  MAX_ROBOTS_BYTES,
  PRODUCT_TOKEN,
  crawlDelaySecondsFor,
  groupFor,
  isAllowed,
  parseRobotsTxt,
  type RobotsFile,
  type RobotsGroup,
  type RobotsRule,
} from './robots.js';

export {
  ROBOTS_TIMEOUT_MS,
  USER_AGENT,
  checkPermission,
  robotsUrlFor,
  type PermissionDecision,
} from './permission.js';

export {
  EXPECTED_SCRIPTS,
  TARGET_GROUPS,
  TargetsError,
  countByGroup,
  parseTargets,
  parseTargetsFile,
  type CampaignTarget,
  type CampaignTargets,
  type TargetGroup,
} from './targets.js';

export {
  DEFAULT_SITE_TIMEOUT_MS,
  MINIMUM_DELAY_MS,
  delayAfter,
  isLoopback,
  runCampaign,
  type CampaignOptions,
  type CampaignProgress,
  type CampaignRun,
  type SiteRecord,
  type SiteStatus,
} from './runner.js';

export {
  aggregateCampaign,
  percentOf,
  type CampaignAggregate,
  type DetectedScriptRow,
  type GroupRow,
  type IssueRow,
  type LabelMismatch,
  type LayerTotals,
} from './aggregate.js';
