CREATE TRIGGER `trg_leftout_report_deletion_tombstone_snapshot`
BEFORE INSERT ON `leftout_report_deletion_tombstones`
WHEN NOT EXISTS (
	SELECT 1
	FROM `leftout_report_deletion_authorizations` AS authorization
	JOIN `leftout_report_records` AS record
		ON record.`id` = authorization.`report_id`
	JOIN `leftout_report_retention_states` AS retention
		ON retention.`report_id` = authorization.`report_id`
	WHERE authorization.`request_id` = NEW.`request_id`
		AND authorization.`request_sha256` = NEW.`request_sha256`
		AND authorization.`custodian_id` = NEW.`custodian_id`
		AND authorization.`authorized_at` = NEW.`deleted_at`
		AND record.`revision` = NEW.`moderation_event_count`
		AND record.`last_event_sha256` = NEW.`last_moderation_event_sha256`
		AND retention.`revision` = NEW.`retention_event_count`
		AND retention.`last_event_sha256` = NEW.`last_retention_event_sha256`
		AND retention.`policy_version` = NEW.`policy_version`
		AND (
			(
				NEW.`publication_survives` = 0
				AND NEW.`public_id` IS NULL
				AND record.`state` != 'published'
				AND NOT EXISTS (
					SELECT 1 FROM `leftout_report_publication_links` AS link
					WHERE link.`report_id` = authorization.`report_id`
				)
			)
			OR
			(
				NEW.`publication_survives` = 1
				AND NEW.`public_id` IS NOT NULL
				AND record.`state` = 'published'
				AND EXISTS (
					SELECT 1
					FROM `leftout_report_publication_links` AS link
					JOIN `leftout_report_publications` AS publication
						ON publication.`public_id` = link.`public_id`
					WHERE link.`report_id` = authorization.`report_id`
						AND publication.`public_id` = NEW.`public_id`
				)
			)
		)
)
BEGIN
	SELECT RAISE(ABORT, 'leftout_report_deletion_tombstone_snapshot_mismatch');
END;
