CREATE TABLE `leftout_report_publication_corrections` (
	`correction_id` text PRIMARY KEY NOT NULL,
	`schema_version` text NOT NULL,
	`public_id` text NOT NULL,
	`corrected_at` text NOT NULL,
	`action` text NOT NULL,
	`reason` text NOT NULL,
	`publication_record_sha256` text NOT NULL,
	`custodian_id` text NOT NULL,
	`request_id` text NOT NULL,
	`request_sha256` text NOT NULL,
	`correction_sha256` text NOT NULL,
	`correction_json` text NOT NULL,
	FOREIGN KEY (`public_id`) REFERENCES `leftout_report_publications`(`public_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "chk_leftout_report_publication_corrections_action" CHECK("leftout_report_publication_corrections"."action" IN ('withdraw')),
	CONSTRAINT "chk_leftout_report_publication_corrections_reason" CHECK("leftout_report_publication_corrections"."reason" IN ('consent_withdrawn','duplicate','erroneous_publication','evidence_invalidated')),
	CONSTRAINT "chk_leftout_report_publication_corrections_record_sha256" CHECK(length("leftout_report_publication_corrections"."publication_record_sha256") = 64),
	CONSTRAINT "chk_leftout_report_publication_corrections_custodian" CHECK(length("leftout_report_publication_corrections"."custodian_id") BETWEEN 3 AND 64),
	CONSTRAINT "chk_leftout_report_publication_corrections_request_sha256" CHECK(length("leftout_report_publication_corrections"."request_sha256") = 64),
	CONSTRAINT "chk_leftout_report_publication_corrections_correction_sha256" CHECK(length("leftout_report_publication_corrections"."correction_sha256") = 64)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_leftout_report_publication_corrections_request` ON `leftout_report_publication_corrections` (`request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_leftout_report_publication_corrections_action` ON `leftout_report_publication_corrections` (`public_id`,`action`);--> statement-breakpoint
CREATE INDEX `idx_leftout_report_publication_corrections_time` ON `leftout_report_publication_corrections` (`corrected_at`,`correction_id`);--> statement-breakpoint
CREATE TRIGGER `trg_leftout_report_publication_correction_snapshot`
BEFORE INSERT ON `leftout_report_publication_corrections`
WHEN NOT EXISTS (
	SELECT 1 FROM `leftout_report_publications`
	WHERE `public_id` = NEW.`public_id`
		AND `record_sha256` = NEW.`publication_record_sha256`
)
BEGIN
	SELECT RAISE(ABORT, 'leftout_report_publication_correction_snapshot_mismatch');
END;--> statement-breakpoint
CREATE TRIGGER `trg_leftout_report_publication_corrections_no_update`
BEFORE UPDATE ON `leftout_report_publication_corrections`
BEGIN
	SELECT RAISE(ABORT, 'leftout_report_publication_corrections_immutable');
END;--> statement-breakpoint
CREATE TRIGGER `trg_leftout_report_publication_corrections_no_delete`
BEFORE DELETE ON `leftout_report_publication_corrections`
BEGIN
	SELECT RAISE(ABORT, 'leftout_report_publication_corrections_immutable');
END;
