CREATE TABLE `leftout_report_publications` (
	`report_id` text PRIMARY KEY NOT NULL,
	`schema_version` text NOT NULL,
	`published_at` text NOT NULL,
	`publisher_id` text NOT NULL,
	`source_revision` integer NOT NULL,
	`record_sha256` text NOT NULL,
	`record_json` text NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `leftout_report_records`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "chk_leftout_report_publications_source_revision" CHECK("leftout_report_publications"."source_revision" >= 2),
	CONSTRAINT "chk_leftout_report_publications_record_sha256" CHECK(length("leftout_report_publications"."record_sha256") = 64)
);
--> statement-breakpoint
CREATE INDEX `idx_leftout_report_publications_published` ON `leftout_report_publications` (`published_at`,`report_id`);--> statement-breakpoint
CREATE TRIGGER `trg_leftout_report_publication_snapshot`
BEFORE INSERT ON `leftout_report_publications`
WHEN NOT EXISTS (
	SELECT 1
	FROM `leftout_report_records` AS record
	JOIN `leftout_report_events` AS event
		ON event.`report_id` = record.`id`
		AND event.`revision` = record.`revision`
	WHERE record.`id` = NEW.`report_id`
		AND record.`state` = 'published'
		AND record.`revision` = NEW.`source_revision`
		AND event.`to_state` = 'published'
		AND event.`actor_role` = 'publisher'
		AND event.`actor_id` = NEW.`publisher_id`
)
BEGIN
	SELECT RAISE(ABORT, 'leftout_report_publication_snapshot_mismatch');
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
END;
