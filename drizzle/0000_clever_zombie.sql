CREATE TABLE `evidence_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`scenario_id` text NOT NULL,
	`scenario_version` text NOT NULL,
	`timestamp` text NOT NULL,
	`origin` text NOT NULL,
	`invocation_channel` text NOT NULL,
	`verdict` text NOT NULL,
	`receipt_json` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_evidence_runs_timestamp` ON `evidence_runs` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_evidence_runs_scenario_timestamp` ON `evidence_runs` (`scenario_id`,`timestamp`);