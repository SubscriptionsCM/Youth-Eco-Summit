# 2027 competition forms and retained files

The supplied **Youth Eco Summit Topics and Guidelines 2027** PDF and later confirmed decisions are represented in `src/data/guidelines-2027.ts`. `scripts/import-2027-guidelines.ts` now compiles all ten formats as **version-four draft** competition records with provenance key `yes-2027-ai-deduction-confirmed-v4`. Version four includes the confirmed AI deduction and the four Waste to Art class bands. The earlier ten version-two source records and version-three Waste to Art record remain preserved. Run the importer through the configured local environment after migrations. It never approves a competition, opens an edition, supplies dates or consent, or changes a prior competition version. Reruns preserve their existing records; an unrelated record at the intended format/version aborts the transaction.

## Rules and unresolved decisions

- `entryLimit: null` means **No Limit**, with no hidden numeric cap. “2 Videos” for craft describes two different files in one entry, not a two-entry limit.
- Group formats use team mode with a minimum of one participant and the source maximum (three, or two for monologue). School and class-category team policies remain unset. Approval validation requires explicit policy choices; no same-school or cross-school rule is inferred.
- Waste to Art eligibility is confirmed for all four bands: Classes 5–6, 7–8, 9–10 and 11–12. Version three records the user decision in its provenance. The PDF’s conflicting ranges and the earlier unresolved version-two draft remain preserved; the class conflict no longer blocks the confirmed configuration.
- Student registration and competition submission dates are confirmed: 1 October through the end of 5 November 2026 in IST. School and teacher registration remain available beyond this cutoff. `npm run local:participation-dates` applies the shared calendar to the database without activating forms. Registration consent, the missing eco-business slide template and the art total of 90 marks remain recorded for review. Source rubrics and confirmed amendments are stored as reference metadata; this import does not create judging rounds, select winners or silently adjust scores.
- AI judging is resolved by the user’s 6 October 2026 decision: **AI-generated submission content receives a 15-point deduction**, with no AI-based disqualification. **Research or reference use of AI is permitted.** This is a human judging rule; the original PDF and earlier configuration versions retain their historical wording, while current rules use the confirmed deduction.
- Painting and Digital Art preserve the source’s combined **AI-generated or copied submission content: −15** row. The AI clarification does not remove the copied-work penalty or create an additional duplicate AI deduction.
- Form topics are restricted server-side to the registered class. Student school, class and author information comes from the authorized registration and team membership, not user-supplied filename text.

Once consent and unresolved policy decisions are supplied, use the existing versioned configuration workflow to create the final configuration and approve it separately. Prior source drafts and confirmed-rule versions remain unchanged as provenance.

## Saved entry steps

The participant entry editor presents **Entry details → Your team (where applicable) → Upload work → Review & submit**. Each Save and Continue awaits `PUT /api/entries/:id` before advancing. The server saves the complete answer/member snapshot and `submissions.current_step` together, increments `lock_version`, and rejects stale writes with HTTP 409. Progress stays outside `answers` because unknown form answer keys are rejected. Returning to the entry restores its saved step. Save progress also accepts partial fields; final submission requires every required answer and declaration.

Final confirmation retains its exact saved version until a definite response arrives. After a network error or server failure, the editor freezes changes and offers Retry submission confirmation, which retries the idempotent POST directly without another draft PUT. A confirmed receipt makes the UI read-only immediately; a definite 4xx response permits correction. Synchronous busy guards prevent duplicate save/confirm actions.

File-status refreshes do not overwrite unsaved fields or replace their original lock version. The UI warns before a document unload with unsaved answers. It does not claim that keystrokes are automatically saved. Server authorization remains required for every save, upload, download and submission; only the lead student's authorized participant account can edit. Team members retain their existing read access and guardian invitation flow.

## File purposes and verification

Every imported format has named roles with required counts, allowed detected MIME types and individual size limits. Upload start and restore check role counts and sizes under the submission row lock. Final submission checks the full selected set again, including metadata. Multipart uploads, checksums, private storage, malware scanning, retained originals and immutable submitted revisions remain in place.

- Written formats require one PDF, 1 MB, with their respective 500–600 / 500–800 / 600–1000 / 1000–1500 word range.
- Craft requires a 360-degree model video (MP4, 25 MB, 30 seconds) and an explanation (MP4, 25 MB, 60 seconds). The two videos therefore cannot exceed 50 MB combined. The optional 1 MB transcript is additional.
- Eco-business requires **both** a PDF presentation up to 2 MB and an MP4 explanation up to 50 MB / 60 seconds.
- Spoken word's optional PDF transcript cannot replace its required captioned MP4. Artwork accepts actual JPEG content, not a renamed PNG.

Sizes use 1 MB = 1,048,576 bytes, matching existing platform limits. The source does not define decimal/binary conversion.

The worker independently inspects retained bytes:

1. Detect actual format, stream byte count and SHA-256; reject mismatches.
2. Use **Poppler `pdftotext`** for written PDFs. Count extracted whitespace-delimited words, including the text in the file, rather than trusting an entered word count. No duplicate typing is required. PDFs without extractable text are rejected; scanned/handwritten work is not accepted. The source does not specify an exclusion for headings/references, so the count includes extracted text. A human must review unusual layouts, extraction anomalies or any requested counting exceptions.
3. Use **`ffprobe`** for duration, display dimensions (including rotation) and orientation where the PDF specifies them. Landscape is required only where stated. 1080p is bounded to a 1920×1080 landscape or 1080×1920 portrait frame when portrait is permitted. Eco-business has no added orientation/resolution restriction because its source section supplies none.
4. Continue required security scanning. Development scan bypass does not bypass the new required word-count/media inspection.

Install `pdftotext` and `ffprobe` on the worker host. `PDFTOTEXT_PATH` and `FFPROBE_PATH` may specify executable paths; otherwise binaries are resolved from `PATH`. Inspection uses a private temporary directory, bounded file bytes, a 20-second process timeout and bounded process output, then removes the temporary files. Missing executables leave verification failed and the file unready; files cannot be submitted while verification is unavailable. Browser metadata checks are early feedback only; the server remains authoritative.

Captions, bylines, citations, originality/AI policy, e-waste percentage, teacher supervision, permitted illustrations, required introduction, language and quality require participant declarations and human guideline screening. Metadata cannot reliably prove these. The system does not claim automated AI detection or apply judging deductions automatically; reviewers apply the confirmed 15-point deduction to AI-generated submission content, while research/reference use remains permitted.

## Submission labels

At final submission the server generates `School_Class_Competition_Project_Authors` from registration snapshots, the selected competition, the entered project title and authorized member names. Unicode letters (including Hindi) are preserved, punctuation/spacing becomes underscores, and each file gets its purpose suffix and verified extension. The original upload filename and bytes remain retained. Judges continue receiving anonymized download filenames. Generated titles are stored in the submission and its immutable revision context.

## Verification

`tests/guidelines-entries.test.ts` covers source compilation, unlimited entries, class-specific topics, declarations, file-role/type/size/count limits, craft durations, eco-business completeness, word/resolution boundaries, Unicode labels, persisted progress, stale/access failures, idempotent submit/import and preservation of old versions. Where Poppler is installed it also extracts and counts a real PDF; its absence is an explicit skipped runtime-dependent test, not a passing extraction check. Existing rules/storage/workflow suites provide regression coverage for authentication, multipart retention and finalization.

On 6 October 2026, the local import created **ten version-four drafts**; an immediate rerun created zero and preserved all ten. Database checks confirmed the −15 policy and current acknowledgement declarations, with the old no-AI assertion absent, and retained the 5 November 2026, 11:59 p.m. IST deadline for students and entries. Historical records remain: eight version one, ten version two and one version three. **23 affected tests passed**: 14 guideline-entry tests, three participation-date configuration tests and six rules tests. The production build, including TypeScript validation, passed. The static review build also passed with 26 HTML pages, internal-asset checks and no API transport. HTTP checks returned 200 with the updated AI rule on `/`, `/faq`, `/competitions` and `/parents`. This clarification was not verified with a full-suite rerun or browser test, and this local verification does not approve or deploy the forms.
