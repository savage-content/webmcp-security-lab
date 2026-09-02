CREATE TABLE `leftout_report_intake_quotas` (
	`bucket_key` text PRIMARY KEY NOT NULL,
	`scope_type` text NOT NULL,
	`scope_id_sha256` text NOT NULL,
	`window_started_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`count` integer NOT NULL,
	`max_count` integer NOT NULL,
	CONSTRAINT "chk_leftout_report_intake_quotas_bucket_key" CHECK(length("leftout_report_intake_quotas"."bucket_key") = 64),
	CONSTRAINT "chk_leftout_report_intake_quotas_scope_type" CHECK("leftout_report_intake_quotas"."scope_type" IN ('global','invitation')),
	CONSTRAINT "chk_leftout_report_intake_quotas_scope_id_sha256" CHECK(length("leftout_report_intake_quotas"."scope_id_sha256") = 64),
	CONSTRAINT "chk_leftout_report_intake_quotas_count" CHECK("leftout_report_intake_quotas"."count" >= 1 AND "leftout_report_intake_quotas"."count" <= "leftout_report_intake_quotas"."max_count"),
	CONSTRAINT "chk_leftout_report_intake_quotas_max_count" CHECK("leftout_report_intake_quotas"."max_count" >= 1)
);
--> statement-breakpoint
CREATE INDEX `idx_leftout_report_intake_quotas_expiry` ON `leftout_report_intake_quotas` (`expires_at`);--> statement-breakpoint
CREATE TRIGGER `trg_leftout_report_intake_quota_integrity`
BEFORE UPDATE ON `leftout_report_intake_quotas`
WHEN NEW.`bucket_key` != OLD.`bucket_key`
	OR NEW.`scope_type` != OLD.`scope_type`
	OR NEW.`scope_id_sha256` != OLD.`scope_id_sha256`
	OR NEW.`window_started_at` != OLD.`window_started_at`
	OR NEW.`expires_at` != OLD.`expires_at`
	OR NEW.`max_count` > OLD.`max_count`
	OR NEW.`count` != OLD.`count` + 1
BEGIN
	SELECT RAISE(ABORT, 'leftout_reporting_quota_integrity');
END;--> statement-breakpoint
CREATE TRIGGER `trg_leftout_report_intake_quota_exhausted`
BEFORE UPDATE ON `leftout_report_intake_quotas`
WHEN NEW.`count` > NEW.`max_count`
BEGIN
	SELECT RAISE(ABORT, 'leftout_reporting_quota_exhausted');
END;
