ALTER TABLE `evidence_runs` ADD `session_id` text NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_evidence_runs_session_timestamp` ON `evidence_runs` (`session_id`,`timestamp`);