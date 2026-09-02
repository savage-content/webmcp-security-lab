CREATE TABLE `leftout_report_retention_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`report_id` text NOT NULL,
	`revision` integer NOT NULL,
	`at` text NOT NULL,
	`actor_id` text NOT NULL,
	`actor_role` text NOT NULL,
	`request_id` text NOT NULL,
	`action` text NOT NULL,
	`legal_hold` integer NOT NULL,
	`retain_until` text NOT NULL,
	`policy_version` text NOT NULL,
	`previous_event_sha256` text,
	`event_sha256` text NOT NULL,
	`event_json` text NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `leftout_report_records`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "chk_leftout_report_retention_events_revision" CHECK("leftout_report_retention_events"."revision" >= 1),
	CONSTRAINT "chk_leftout_report_retention_events_actor_role" CHECK("leftout_report_retention_events"."actor_role" IN ('custodian','system')),
	CONSTRAINT "chk_leftout_report_retention_events_action" CHECK("leftout_report_retention_events"."action" IN ('policy_assigned','legal_hold_set','legal_hold_cleared')),
	CONSTRAINT "chk_leftout_report_retention_events_legal_hold" CHECK("leftout_report_retention_events"."legal_hold" IN (0, 1)),
	CONSTRAINT "chk_leftout_report_retention_events_previous_event_sha256" CHECK("leftout_report_retention_events"."previous_event_sha256" IS NULL OR length("leftout_report_retention_events"."previous_event_sha256") = 64),
	CONSTRAINT "chk_leftout_report_retention_events_event_sha256" CHECK(length("leftout_report_retention_events"."event_sha256") = 64)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_leftout_report_retention_events_report_revision` ON `leftout_report_retention_events` (`report_id`,`revision`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_leftout_report_retention_events_report_request` ON `leftout_report_retention_events` (`report_id`,`request_id`);--> statement-breakpoint
CREATE TABLE `leftout_report_retention_states` (
	`report_id` text PRIMARY KEY NOT NULL,
	`schema_version` text NOT NULL,
	`revision` integer NOT NULL,
	`updated_at` text NOT NULL,
	`legal_hold` integer NOT NULL,
	`retain_until` text NOT NULL,
	`policy_version` text NOT NULL,
	`last_event_sha256` text NOT NULL,
	`state_json` text NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `leftout_report_records`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "chk_leftout_report_retention_states_revision" CHECK("leftout_report_retention_states"."revision" >= 1),
	CONSTRAINT "chk_leftout_report_retention_states_legal_hold" CHECK("leftout_report_retention_states"."legal_hold" IN (0, 1)),
	CONSTRAINT "chk_leftout_report_retention_states_last_event_sha256" CHECK(length("leftout_report_retention_states"."last_event_sha256") = 64)
);
--> statement-breakpoint
CREATE INDEX `idx_leftout_report_retention_states_due` ON `leftout_report_retention_states` (`legal_hold`,`retain_until`);--> statement-breakpoint
CREATE TRIGGER `trg_leftout_report_retention_event_snapshot`
BEFORE INSERT ON `leftout_report_retention_events`
WHEN NOT EXISTS (
	SELECT 1 FROM `leftout_report_retention_states`
	WHERE `report_id` = NEW.`report_id`
		AND `revision` = NEW.`revision`
		AND `last_event_sha256` = NEW.`event_sha256`
)
BEGIN
	SELECT RAISE(ABORT, 'leftout_report_retention_event_snapshot_mismatch');
END;--> statement-breakpoint
CREATE TRIGGER `trg_leftout_report_retention_event_chain`
BEFORE INSERT ON `leftout_report_retention_events`
WHEN (NEW.`revision` = 1 AND NEW.`previous_event_sha256` IS NOT NULL)
	OR (NEW.`revision` > 1 AND NOT EXISTS (
		SELECT 1 FROM `leftout_report_retention_events`
		WHERE `report_id` = NEW.`report_id`
			AND `revision` = NEW.`revision` - 1
			AND `event_sha256` = NEW.`previous_event_sha256`
	))
BEGIN
	SELECT RAISE(ABORT, 'leftout_report_retention_event_chain_mismatch');
END;--> statement-breakpoint
CREATE TRIGGER `trg_leftout_report_retention_events_no_update`
BEFORE UPDATE ON `leftout_report_retention_events`
BEGIN
	SELECT RAISE(ABORT, 'leftout_report_retention_events_append_only');
END;--> statement-breakpoint
CREATE TRIGGER `trg_leftout_report_retention_events_no_delete`
BEFORE DELETE ON `leftout_report_retention_events`
BEGIN
	SELECT RAISE(ABORT, 'leftout_report_retention_events_append_only');
END;--> statement-breakpoint
CREATE TRIGGER `trg_leftout_report_retention_state_integrity`
BEFORE UPDATE ON `leftout_report_retention_states`
WHEN NEW.`report_id` != OLD.`report_id`
	OR NEW.`schema_version` != OLD.`schema_version`
	OR NEW.`revision` != OLD.`revision` + 1
	OR NEW.`updated_at` < OLD.`updated_at`
	OR NEW.`legal_hold` = OLD.`legal_hold`
	OR NEW.`retain_until` != OLD.`retain_until`
	OR NEW.`policy_version` != OLD.`policy_version`
	OR NEW.`last_event_sha256` = OLD.`last_event_sha256`
BEGIN
	SELECT RAISE(ABORT, 'leftout_report_retention_state_integrity');
END;--> statement-breakpoint
CREATE TRIGGER `trg_leftout_report_retention_states_no_delete`
BEFORE DELETE ON `leftout_report_retention_states`
BEGIN
	SELECT RAISE(ABORT, 'leftout_report_retention_states_require_retention_workflow');
END;
