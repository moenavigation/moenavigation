# Form data & image uploads

Enter data/select images → prepare in browser → Submit → upload images →
save text + image URLs together → success.

Resize oversized images without changing aspect ratio; compress with minimal
visible quality loss, trying WebP first. Keep the original format if
conversion is unsupported, larger, or risks compatibility or quality.
Preserve transparency, retaining PNG when needed. Finish browser processing
before upload; upload only after Submit.

Authorize and validate uploads/saves server-side; keep secrets off the
client. Preserve input and prepared images, and show clear progress/errors.
Allow a small, configurable number of user-triggered retries per stage:

- Upload failure: stop before saving; retry only failed uploads, retaining
  successful ones.
- Database failure: stop; retry saving with existing uploaded URLs, without
  re-uploading or creating duplicate records. After retries are exhausted,
  verify saving failed and delete only that submission's newly uploaded,
  unreferenced images. Later attempts must re-upload any deleted images.

Resolve uncertain save outcomes before deleting assets. Protect previously
saved images and media needed for Trash restoration. Provide an authorized
manual Cleanup button for leftover uploads confirmed unreferenced, including
failed deletions. Routine/background media cleanup is unnecessary.

Show success only after uploads and the database save both succeed.
