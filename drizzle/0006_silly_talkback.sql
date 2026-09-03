CREATE TABLE `leftout_report_deletion_authorizations` (
	`report_id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`request_sha256` text NOT NULL,
	`custodian_id` text NOT NULL,
	`expected_retention_revision` integer NOT NULL,
	`authorized_at` text NOT NULL,
	CONSTRAINT "chk_leftout_report_deletion_authorizations_request_sha256" CHECK(length("leftout_report_deletion_authorizations"."request_sha256") = 64),
	CONSTRAINT "chk_leftout_report_deletion_authorizations_revision" CHECK("leftout_report_deletion_authorizations"."expected_retention_revision" >= 1),
	CONSTRAINT "chk_leftout_report_deletion_authorizations_custodian" CHECK(length("leftout_report_deletion_authorizations"."custodian_id") BETWEEN 3 AND 64)
);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_leftout_report_deletion_authorizations_request` ON `leftout_report_deletion_authorizations` (`request_id`);--> statement-breakpoint
CREATE TABLE `leftout_report_deletion_tombstones` (
	`tombstone_id` text PRIMARY KEY NOT NULL,
	`schema_version` text NOT NULL,
	`deleted_at` text NOT NULL,
	`reason` text NOT NULL,
	`policy_version` text NOT NULL,
	`public_id` text,
	`publication_survives` integer NOT NULL,
	`moderation_event_count` integer NOT NULL,
	`retention_event_count` integer NOT NULL,
	`last_moderation_event_sha256` text NOT NULL,
	`last_retention_event_sha256` text NOT NULL,
	`custodian_id` text NOT NULL,
	`request_id` text NOT NULL,
	`request_sha256` text NOT NULL,
	`tombstone_sha256` text NOT NULL,
	`tombstone_json` text NOT NULL,
	CONSTRAINT "chk_leftout_report_deletion_tombstones_reason" CHECK("leftout_report_deletion_tombstones"."reason" IN ('retention_expired','data_subject_request')),
	CONSTRAINT "chk_leftout_report_deletion_tombstones_publication" CHECK(("leftout_report_deletion_tombstones"."publication_survives" = 0 AND "leftout_report_deletion_tombstones"."public_id" IS NULL) OR ("leftout_report_deletion_tombstones"."publication_survives" = 1 AND "leftout_report_deletion_tombstones"."public_id" IS NOT NULL)),
	CONSTRAINT "chk_leftout_report_deletion_tombstones_counts" CHECK("leftout_report_deletion_tombstones"."moderation_event_count" >= 1 AND "leftout_report_deletion_tombstones"."retention_event_count" >= 1),
	CONSTRAINT "chk_leftout_report_deletion_tombstones_moderation_sha256" CHECK(length("leftout_report_deletion_tombstones"."last_moderation_event_sha256") = 64),
	CONSTRAINT "chk_leftout_report_deletion_tombstones_retention_sha256" CHECK(length("leftout_report_deletion_tombstones"."last_retention_event_sha256") = 64),
	CONSTRAINT "chk_leftout_report_deletion_tombstones_request_sha256" CHECK(length("leftout_report_deletion_tombstones"."request_sha256") = 64),
	CONSTRAINT "chk_leftout_report_deletion_tombstones_tombstone_sha256" CHECK(length("leftout_report_deletion_tombstones"."tombstone_sha256") = 64)
);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_leftout_report_deletion_tombstones_request` ON `leftout_report_deletion_tombstones` (`request_id`);--> statement-breakpoint
CREATE INDEX `idx_leftout_report_deletion_tombstones_deleted` ON `leftout_report_deletion_tombstones` (`deleted_at`,`tombstone_id`);--> statement-breakpoint
DROP TRIGGER IF EXISTS `trg_leftout_report_events_no_delete`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `trg_leftout_report_idempotency_no_delete`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `trg_leftout_report_records_no_delete`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `trg_leftout_report_retention_events_no_delete`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `trg_leftout_report_retention_states_no_delete`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `trg_leftout_report_publication_snapshot`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `trg_leftout_report_publications_no_update`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `trg_leftout_report_publications_no_delete`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__leftout_report_publication_migration` (
	`report_id` text PRIMARY KEY NOT NULL,
	`public_id` text NOT NULL UNIQUE
);--> statement-breakpoint
INSERT INTO `__leftout_report_publication_migration` (`report_id`, `public_id`)
SELECT publication.`report_id`, event.`event_id`
FROM `leftout_report_publications` AS publication
JOIN `leftout_report_events` AS event
	ON event.`report_id` = publication.`report_id`
	AND event.`revision` = publication.`source_revision`
	AND event.`to_state` = 'published'
	AND event.`actor_role` = 'publisher';--> statement-breakpoint
CREATE TABLE `__leftout_report_publication_migration_guard` (
	`mismatch_count` integer NOT NULL CHECK (`mismatch_count` = 0)
);--> statement-breakpoint
INSERT INTO `__leftout_report_publication_migration_guard` (`mismatch_count`)
SELECT (SELECT count(*) FROM `leftout_report_publications`) -
	(SELECT count(*) FROM `__leftout_report_publication_migration`);--> statement-breakpoint
CREATE TABLE `__new_leftout_report_publications` (
	`public_id` text PRIMARY KEY NOT NULL,
	`schema_version` text NOT NULL,
	`published_at` text NOT NULL,
	`publisher_id` text NOT NULL,
	`source_revision` integer NOT NULL,
	`record_sha256` text NOT NULL,
	`record_json` text NOT NULL,
	CONSTRAINT "chk_leftout_report_publications_source_revision" CHECK("__new_leftout_report_publications"."source_revision" >= 2),
	CONSTRAINT "chk_leftout_report_publications_record_sha256" CHECK(length("__new_leftout_report_publications"."record_sha256") = 64)
);--> statement-breakpoint
INSERT INTO `__new_leftout_report_publications` (`public_id`, `schema_version`, `published_at`, `publisher_id`, `source_revision`, `record_sha256`, `record_json`)
SELECT migration.`public_id`, publication.`schema_version`, publication.`published_at`, publication.`publisher_id`, publication.`source_revision`, publication.`record_sha256`, publication.`record_json`
FROM `leftout_report_publications` AS publication
JOIN `__leftout_report_publication_migration` AS migration
	ON migration.`report_id` = publication.`report_id`;--> statement-breakpoint
DROP TABLE `leftout_report_publications`;--> statement-breakpoint
ALTER TABLE `__new_leftout_report_publications` RENAME TO `leftout_report_publications`;--> statement-breakpoint
CREATE INDEX `idx_leftout_report_publications_published` ON `leftout_report_publications` (`published_at`,`public_id`);--> statement-breakpoint
CREATE TABLE `leftout_report_publication_links` (
	`report_id` text PRIMARY KEY NOT NULL,
	`public_id` text NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `leftout_report_records`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`public_id`) REFERENCES `leftout_report_publications`(`public_id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_leftout_report_publication_links_public` ON `leftout_report_publication_links` (`public_id`);--> statement-breakpoint
INSERT INTO `leftout_report_publication_links` (`report_id`, `public_id`)
SELECT `report_id`, `public_id` FROM `__leftout_report_publication_migration`;--> statement-breakpoint
DROP TABLE `__leftout_report_publication_migration_guard`;--> statement-breakpoint
DROP TABLE `__leftout_report_publication_migration`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TRIGGER `trg_leftout_report_publication_link_snapshot`
BEFORE INSERT ON `leftout_report_publication_links`
WHEN NOT EXISTS (
	SELECT 1
	FROM `leftout_report_records` AS record
	JOIN `leftout_report_events` AS event
		ON event.`report_id` = record.`id`
		AND event.`revision` = record.`revision`
	JOIN `leftout_report_publications` AS publication
		ON publication.`public_id` = NEW.`public_id`
	WHERE record.`id` = NEW.`report_id`
		AND record.`state` = 'published'
		AND record.`revision` = publication.`source_revision`
		AND event.`to_state` = 'published'
		AND event.`actor_role` = 'publisher'
		AND event.`actor_id` = publication.`publisher_id`
		AND event.`event_id` = publication.`public_id`
)
BEGIN
	SELECT RAISE(ABORT, 'leftout_report_publication_link_snapshot_mismatch');
END;--> statement-breakpoint
CREATE TRIGGER `trg_leftout_report_publications_no_update`
BEFORE UPDATE ON `leftout_report_publications`
BEGIN
	SELECT RAISE(ABORT, 'leftout_report_publications_immutable');
END;--> statement-breakpoint
CREATE TRIGGER `trg_leftout_report_publications_no_delete`
BEFORE DELETE ON `leftout_report_publications`
BEGIN
	SELECT RAISE(ABORT, 'leftout_report_publications_immutable');
END;--> statement-breakpoint
CREATE TRIGGER `trg_leftout_report_publication_links_no_update`
BEFORE UPDATE ON `leftout_report_publication_links`
BEGIN
	SELECT RAISE(ABORT, 'leftout_report_publication_links_immutable');
END;--> statement-breakpoint
CREATE TRIGGER `trg_leftout_report_publication_links_no_delete`
BEFORE DELETE ON `leftout_report_publication_links`
WHEN NOT EXISTS (
	SELECT 1 FROM `leftout_report_deletion_authorizations`
	WHERE `report_id` = OLD.`report_id`
)
BEGIN
	SELECT RAISE(ABORT, 'leftout_report_publication_links_require_retention_workflow');
END;--> statement-breakpoint
CREATE TRIGGER `trg_leftout_report_events_no_delete`
BEFORE DELETE ON `leftout_report_events`
WHEN NOT EXISTS (
	SELECT 1 FROM `leftout_report_deletion_authorizations`
	WHERE `report_id` = OLD.`report_id`
)
BEGIN
	SELECT RAISE(ABORT, 'leftout_report_events_append_only');
END;--> statement-breakpoint
CREATE TRIGGER `trg_leftout_report_idempotency_no_delete`
BEFORE DELETE ON `leftout_report_intake_idempotency`
WHEN NOT EXISTS (
	SELECT 1 FROM `leftout_report_deletion_authorizations`
	WHERE `report_id` = OLD.`report_id`
)
BEGIN
	SELECT RAISE(ABORT, 'leftout_report_idempotency_append_only');
END;--> statement-breakpoint
CREATE TRIGGER `trg_leftout_report_records_no_delete`
BEFORE DELETE ON `leftout_report_records`
WHEN NOT EXISTS (
	SELECT 1 FROM `leftout_report_deletion_authorizations`
	WHERE `report_id` = OLD.`id`
)
BEGIN
	SELECT RAISE(ABORT, 'leftout_report_records_require_retention_workflow');
END;--> statement-breakpoint
CREATE TRIGGER `trg_leftout_report_retention_events_no_delete`
BEFORE DELETE ON `leftout_report_retention_events`
WHEN NOT EXISTS (
	SELECT 1 FROM `leftout_report_deletion_authorizations`
	WHERE `report_id` = OLD.`report_id`
)
BEGIN
	SELECT RAISE(ABORT, 'leftout_report_retention_events_append_only');
END;--> statement-breakpoint
CREATE TRIGGER `trg_leftout_report_retention_states_no_delete`
BEFORE DELETE ON `leftout_report_retention_states`
WHEN NOT EXISTS (
	SELECT 1 FROM `leftout_report_deletion_authorizations`
	WHERE `report_id` = OLD.`report_id`
)
BEGIN
	SELECT RAISE(ABORT, 'leftout_report_retention_states_require_retention_workflow');
END;--> statement-breakpoint
CREATE TRIGGER `trg_leftout_report_deletion_authorization_snapshot`
BEFORE INSERT ON `leftout_report_deletion_authorizations`
WHEN NOT EXISTS (
	SELECT 1 FROM `leftout_report_retention_states`
	WHERE `report_id` = NEW.`report_id`
		AND `revision` = NEW.`expected_retention_revision`
		AND `legal_hold` = 0
)
BEGIN
	SELECT RAISE(ABORT, 'leftout_report_deletion_authorization_snapshot_mismatch');
END;--> statement-breakpoint
CREATE TRIGGER `trg_leftout_report_deletion_authorizations_no_update`
BEFORE UPDATE ON `leftout_report_deletion_authorizations`
BEGIN
	SELECT RAISE(ABORT, 'leftout_report_deletion_authorizations_immutable');
END;--> statement-breakpoint
CREATE TRIGGER `trg_leftout_report_deletion_tombstones_no_update`
BEFORE UPDATE ON `leftout_report_deletion_tombstones`
BEGIN
	SELECT RAISE(ABORT, 'leftout_report_deletion_tombstones_immutable');
END;--> statement-breakpoint
CREATE TRIGGER `trg_leftout_report_deletion_tombstones_no_delete`
BEFORE DELETE ON `leftout_report_deletion_tombstones`
BEGIN
	SELECT RAISE(ABORT, 'leftout_report_deletion_tombstones_immutable');
END;
