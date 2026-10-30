export const SAFE_DELETION_SCHEMA = [
  'ALTER TABLE recordings ADD COLUMN deletion_reserved INTEGER NOT NULL DEFAULT 0',
];
