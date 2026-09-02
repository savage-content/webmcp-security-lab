CREATE TABLE `leftout_report_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`report_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`revision` integer NOT NULL,
	`at` text NOT NULL,
	`actor_id` text NOT NULL,
	`actor_role` text NOT NULL,
	`request_id` text NOT NULL,
	`from_state` text NOT NULL,
	`to_state` text NOT NULL,
	`payload_sha256` text NOT NULL,
	`previous_event_sha256` text,
	`event_sha256` text NOT NULL,
	`event_json` text NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `leftout_report_records`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "chk_leftout_report_events_sequence" CHECK("leftout_report_events"."sequence" >= 1),
	CONSTRAINT "chk_leftout_report_events_revision" CHECK("leftout_report_events"."revision" = "leftout_report_events"."sequence"),
	CONSTRAINT "chk_leftout_report_events_actor_role" CHECK("leftout_report_events"."actor_role" IN ('intake','reviewer','publisher','system')),
	CONSTRAINT "chk_leftout_report_events_from_state" CHECK("leftout_report_events"."from_state" IN ('received','quarantined','under_review','needs_evidence','accepted_private','duplicate','rejected','published')),
	CONSTRAINT "chk_leftout_report_events_to_state" CHECK("leftout_report_events"."to_state" IN ('quarantined','under_review','needs_evidence','accepted_private','duplicate','rejected','published')),
	CONSTRAINT "chk_leftout_report_events_payload_sha256" CHECK(length("leftout_report_events"."payload_sha256") = 64),
	CONSTRAINT "chk_leftout_report_events_previous_event_sha256" CHECK("leftout_report_events"."previous_event_sha256" IS NULL OR length("leftout_report_events"."previous_event_sha256") = 64),
	CONSTRAINT "chk_leftout_report_events_event_sha256" CHECK(length("leftout_report_events"."event_sha256") = 64)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_leftout_report_events_report_sequence` ON `leftout_report_events` (`report_id`,`sequence`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_leftout_report_events_report_request` ON `leftout_report_events` (`report_id`,`request_id`);--> statement-breakpoint
CREATE TABLE `leftout_report_intake_idempotency` (
	`invitation_id` text NOT NULL,
	`key_sha256` text NOT NULL,
	`request_sha256` text NOT NULL,
	`report_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `leftout_report_records`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "chk_leftout_report_intake_key_sha256" CHECK(length("leftout_report_intake_idempotency"."key_sha256") = 64),
	CONSTRAINT "chk_leftout_report_intake_request_sha256" CHECK(length("leftout_report_intake_idempotency"."request_sha256") = 64)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_leftout_report_intake_idempotency_key` ON `leftout_report_intake_idempotency` (`invitation_id`,`key_sha256`);--> statement-breakpoint
CREATE TABLE `leftout_report_records` (
	`id` text PRIMARY KEY NOT NULL,
	`schema_version` text NOT NULL,
	`revision` integer NOT NULL,
	`state` text NOT NULL,
	`received_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_event_sha256` text NOT NULL,
	`record_json` text NOT NULL,
	CONSTRAINT "chk_leftout_report_records_revision" CHECK("leftout_report_records"."revision" >= 1),
	CONSTRAINT "chk_leftout_report_records_state" CHECK("leftout_report_records"."state" IN ('quarantined','under_review','needs_evidence','accepted_private','duplicate','rejected','published')),
	CONSTRAINT "chk_leftout_report_records_last_event_sha256" CHECK(length("leftout_report_records"."last_event_sha256") = 64)
);
--> statement-breakpoint
CREATE INDEX `idx_leftout_report_records_state_updated` ON `leftout_report_records` (`state`,`updated_at`);--> statement-breakpoint
CREATE TRIGGER `trg_leftout_report_event_snapshot`
BEFORE INSERT ON `leftout_report_events`
WHEN NOT EXISTS (
	SELECT 1 FROM `leftout_report_records`
	WHERE `id` = NEW.`report_id`
		AND `revision` = NEW.`revision`
		AND `last_event_sha256` = NEW.`event_sha256`
)
BEGIN
	SELECT RAISE(ABORT, 'leftout_report_event_snapshot_mismatch');
END;--> statement-breakpoint
CREATE TRIGGER `trg_leftout_report_event_chain`
BEFORE INSERT ON `leftout_report_events`
WHEN (NEW.`sequence` = 1 AND NEW.`previous_event_sha256` IS NOT NULL)
	OR (NEW.`sequence` > 1 AND NOT EXISTS (
		SELECT 1 FROM `leftout_report_events`
		WHERE `report_id` = NEW.`report_id`
			AND `sequence` = NEW.`sequence` - 1
			AND `event_sha256` = NEW.`previous_event_sha256`
	))
BEGIN
	SELECT RAISE(ABORT, 'leftout_report_event_chain_mismatch');
END;--> statement-breakpoint
CREATE TRIGGER `trg_leftout_report_events_no_update`
BEFORE UPDATE ON `leftout_report_events`
BEGIN
	SELECT RAISE(ABORT, 'leftout_report_events_append_only');
END;--> statement-breakpoint
CREATE TRIGGER `trg_leftout_report_events_no_delete`
BEFORE DELETE ON `leftout_report_events`
BEGIN
	SELECT RAISE(ABORT, 'leftout_report_events_append_only');
END;--> statement-breakpoint
CREATE TRIGGER `trg_leftout_report_idempotency_no_update`
BEFORE UPDATE ON `leftout_report_intake_idempotency`
BEGIN
	SELECT RAISE(ABORT, 'leftout_report_idempotency_append_only');
END;--> statement-breakpoint
CREATE TRIGGER `trg_leftout_report_idempotency_no_delete`
BEFORE DELETE ON `leftout_report_intake_idempotency`
BEGIN
	SELECT RAISE(ABORT, 'leftout_report_idempotency_append_only');
END;--> statement-breakpoint
CREATE TRIGGER `trg_leftout_report_records_no_delete`
BEFORE DELETE ON `leftout_report_records`
BEGIN
	SELECT RAISE(ABORT, 'leftout_report_records_require_retention_workflow');
END;
