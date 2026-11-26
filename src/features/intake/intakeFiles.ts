/** Attachment rules for the staff intake. Matches the public form: PDF, JPEG or PNG, 2 MB each. */
export const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export const ACCEPTED_TYPES_LABEL_STAFF = 'Use a PDF, JPEG or PNG file';
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_STAGED_FILES = 6;
