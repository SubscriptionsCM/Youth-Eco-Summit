# Frontend asset provenance

Updated 29 September 2026. All delivered assets live in `public/images/`.

The imagery comes from Youth Eco Summit event photographs and the previously built homepage. The supplied visual references informed composition and layering; their people, branding and artwork were not reused as Summit participants. Generated cutouts are editorial edits of real event photographs, not evidence of a newly photographed event. No SVG assets or patterns were created.

## Asset inventory

| Delivered file | Origin and treatment |
| --- | --- |
| `public/images/logo.png` | Original Summit logo, inherited from the previous homepage. [Original PNG](https://youthecosummit.com/wp-content/uploads/2024/08/Logo-for-YES-1.png). |
| `public/images/hero-cutout.webp` | Inherited editorial collage generated from [P2176488.jpg](https://youthecosummit.com/wp-content/uploads/2025/12/P2176488.jpg) and [P2176510.jpg](https://youthecosummit.com/wp-content/uploads/2025/12/P2176510.jpg). Student portraits were extracted and composed with restrained purple/yellow/lavender outlines and an alpha background. |
| `public/images/about-cutout.webp` | Original retained for reference: inherited editorial workshop cutout derived from [Innovate.jpg](https://youthecosummit.com/wp-content/uploads/2025/12/Innovate.jpg), retaining the educator, adjacent students and part of the workshop table. |
| `public/images/speaker-cutout.webp` | New transparent background extraction from [DSC03803.jpg](https://youthecosummit.com/wp-content/uploads/2025/12/DSC03803.jpg). Speaker, gestures, microphones and lectern retained. 1024 × 1536 WebP with alpha. |
| `public/images/creative-cutout.webp` | New transparent background extraction from [P2176237.jpg](https://youthecosummit.com/wp-content/uploads/2025/12/P2176237.jpg). Artist, brush and recipient's visible forearm retained. 1536 × 1024 WebP with alpha. Its original bottom/right crop is intentional. |
| `public/images/students.jpg`, `public/images/school.jpg`, `public/images/awards.jpg`, `public/images/workshop.jpg`, `public/images/speaker.jpg` | Existing photographs inherited from the earlier homepage, whose source sites were [Youth Eco Summit](https://youthecosummit.com/) and the [revised-site reference](https://mcodify.in/youthecosummit/). An exact source-to-delivered-filename mapping was not recovered; do not infer individual source URLs from these descriptive filenames. |

The two new cutouts used the built-in image generation/editing tool with transparent backgrounds, then lossless WebP encoding. Their alpha masks and subject appearance were inspected against the input photographs. Colour/grayscale treatment may be applied in CSS, separately from the retained raster file. The speaker is described as a speaker, not identified as a student without confirmation.

## New extraction prompts

These prompts preserve the useful production record without temporary tool-output paths.

### Speaker cutout

Use case: background-extraction. Asset type: transparent editorial photo cutout for the Youth Eco Summit website. Input image is the EDIT TARGET, a genuine Youth Eco Summit event photograph. Isolate ONLY the actual female speaker with her raised hands, original microphones and entire visible lectern. Remove all backdrop, stage, floor, lights and background logos. Preserve her exact face, identity, expression, hair, skin, clothing, hands, pose, camera angle, and every visible part of the lectern and its original printing. Do not invent body parts hidden by the lectern. Retain original photographic color and texture. Crop tightly around the retained speaker-plus-lectern as a tall portrait cutout with a little transparent space around its silhouette, letting the original lectern crop end at the bottom. Background must have actual alpha transparency, including holes between hands and body. No decorative border, no new text, no graphic, no shadow, no new people, no recoloring. Only remove the background.

### Creative workshop cutout

Use case: background-extraction. Asset type: transparent editorial photographic cutout for the Youth Eco Summit website. Input image is the EDIT TARGET, a genuine event photograph. Isolate the actual young artist in the black T-shirt in the foreground, with her face, long ponytail, torso, both visible hands and fine paintbrush, together with the recipient's visible extended forearm and the original green circle she is painting. Retain the recipient's actual visible right-side white sleeve and orange scarf as a cropped edge so her forearm remains naturally connected. Remove all other people behind the artist, wall, and tabletop clutter. Preserve the exact faces, identity, pose, hands, expression, clothing, camera angle and photographic detail of the retained subjects. Do not invent hidden anatomy or new artwork. Maintain the original close composition with the artist prominent, existing crop boundaries at bottom and right are acceptable. Actual transparent alpha background, no decorative outlines, no added text, no graphic, no shadow, no added people, no recoloring. Only remove the surrounding background and background people.

## Reuse notes

- Keep the alpha channel when resizing or converting cutouts. Do not flatten them onto a baked-in page background; the foreground and CSS background layers move independently.
- Keep the creative cutout aligned to a card edge so its source crop remains natural. Avoid stretching it into a portrait aspect ratio.
- Alt text should describe the pictured activity or role without inventing a participant's name, award, school or testimonial.
- These event images illustrate the programme. They are separate from privately submitted student work, which must continue through the backend's publication-consent and moderation flow before it appears in the public showcase.
- Primary provenance for the new assets is the project's `work/assets-notes.md`; inherited hero/about/logo provenance comes from the previous homepage's asset manifest. The present document is the portable handoff record.

## Completed workshop cutout — 29 September 2026

`public/images/about-cutout-complete.webp` replaces the workshop cutout in the homepage and reused editorial compositions. The built-in GPT Image tool extended the cropped left shoulder, backpack, sleeve and elbow, continuing the existing yellow/purple outline. A second edit added a square canvas and transparent margins. The final 1254 × 1254 RGBA image was encoded to lossless WebP without modifying the generated pixels. The original asset is retained.

Final framing prompt: “Only adjust framing to make the complete existing collage fit safely inside the image. Deliver a SQUARE canvas. Zoom out so the whole existing three-person cutout plus complete table and all outlines occupy approximately 85 percent of the square's height, centered horizontally. Leave wide actual transparent margins on LEFT and RIGHT, and transparent margins at TOP and BOTTOM. Do not let the leftmost backpack or any purple/yellow outline touch the canvas edge. Complete the tiny remaining cut-off outer backpack/outline at the left if needed. Keep all existing faces, people, poses, clothing, table objects, grayscale photograph, mustard yellow border and muted purple outer border unchanged. Do not create any new scenery or text. Genuine alpha transparent background. The natural complete left silhouette and full elbow must be entirely visible with generous transparent space outside.”

## Preferred hero and additional archive assets

The hero WebP was compared with the published earlier sample at `https://compactummedia.com/youthecosummit/home/assets/hero-cutout.webp`: the files are byte-identical (SHA-256 `07aed9861f001acdff298b57f0bcfdd17f3825b5f3ea1909806e2d4eb36dcf40`). The homepage now serves that exact original asset directly, avoiding Next.js lossy recompression around the transparent outline. It is contained within the hero frame to keep the top row of portraits visible. No new hero image was generated or recoloured.

Real speaker posters, partner marks, event photographs and historical PDFs added in the visual expansion are documented in [summit-source-audit.md](summit-source-audit.md).
