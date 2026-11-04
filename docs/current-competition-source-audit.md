# Competition source audit

Checked 30 September 2026. Read-only review of the supplied websites, linked public documents, and local catalogue. No competition settings, deadlines, accounts or submissions were changed.

## Subsequent user direction — 30 September 2026

The user explicitly authorised carrying these competitions into 2027: “you can copy the competitions from youthecosummit.com, We will very likely be having the same competitions in 2027 as well.” This supersedes the historical-only presentation recommendation below.

The frontend now presents all eight as the planned 2027 lineup, with real summit photographs, short editorial introductions and one note that final guidelines, class categories and dates will follow. Historical winner classes are not used as new eligibility rules. Published 2027 records attach their guideline links to the matching cards by slug; drafts never enable entry creation. The linked 2026 results remain explicitly historical.

## Finding

The official website does contain enough competition information to present a useful historical catalogue. The redesigned page should have shown those verified activities alongside the live backend catalogue. The two local cards are synthetic integration-test records; they do not represent the Summit’s actual competition offering.

The sources mix editions. The current [homepage](https://youthecosummit.com/) identifies 2027 and gives the theme **Waste Segregation: The Need of the Hour**. However, the linked [Participate page](https://youthecosummit.com/participate/) still identifies 2026 and gives the exact theme **“Youth × AI: Green Leaders of Tomorrow.”** Its registration link resolves back to the homepage. Historical information must not silently become open 2027 competition configuration.

## Verified activities from the 2026 results

Source: [2026 winner list, four pages](https://youthecosummit.com/wp-content/uploads/2026/02/Final-Winner-sheet2026.pdf).

| Category | Activity | What the document establishes |
| --- | --- | --- |
| Written | Essay | Winner rows show Class 6; no eligibility band stated. The source misspells the activity “Esaay.” |
| Written | Article Writing | Winners are in Classes 9 and 10; no eligibility band stated. |
| Written | Blog Writing | Winners are in Classes 11 and 12; no eligibility band stated. |
| Video | Short Film Making | Named tracks: Classes 7–8 and 11–12. |
| Speech | Spoken Word (Monologue) | Named tracks: Classes 5–6, 7–8, 9–10 and 11–12. |
| Art | Painting | Named tracks: Classes 5–6 and 7–8. |
| Craft | Waste to Art | Named tracks: Classes 7–8 and 9–10. |
| Eco-Entrepreneurship | Eco-Business Model | Named tracks: Classes 7–8, 9–10 and 11–12. |

This yields **eight activity names and sixteen rows/tracks when class subdivisions are counted**, calculated from the results. It does not prove sixteen currently available competitions. Some winner classes fall outside their named track, so results are not a reliable substitute for eligibility rules. The document supplies no submission deadlines, word limits, durations or upload restrictions.

## Awards are not the same as activities

The [official Awards page](https://youthecosummit.com/youth-eco-summit-awards/) is explicitly labelled 2026. It lists nineteen award names, including school/educator recognition as well as student awards. These labels cannot be treated as nineteen configured competitions. The public pages reviewed do not independently substantiate a count of fifteen current competition categories. Retain the user-approved meeting statement of fifteen awards; it is a different claim from the historical activity/track count, not something this audit disproves.

The homepage also links [2025 gold results](https://youthecosummit.com/wp-content/uploads/2025/11/Gold-Medalists_Youth-Eco-Summit-2025.pdf), silver/bronze/special-mention files, and a 2024 winner document. These are archives, not current submission instructions.

## Other supplied website and forms

- [mCodify reference homepage](https://mcodify.in/youthecosummit/) also presents the 2027 waste-segregation theme, alongside 2026 speaker and winner material. Its visible competition-adjacent content is an awards promotion and previous winners, not a complete 2027 rules catalogue. Its navigation contains placeholder anchors. The web reader could not load it, but a direct read-only HTTP retrieval succeeded.
- The reference site’s [Eco Educator link](https://forms.gle/1cv6DUpoRx428Q3w5) resolves to [Eco Educator Programme 2027 — Teacher Registration](https://docs.google.com/forms/d/e/1FAIpQLSd8V12LzXuyeB5j2Isz4EZ68n15hx30V9PC70_pGZ80KWJejg/viewform?usp=send_form). Its public form definition collects teacher/school/background details and sustainability interests. It is not a student competition form and supplies no competition deadlines.
- The [student form originally shared by the user](https://docs.google.com/forms/d/e/1FAIpQLScw-cg-JBri-qiGKu4oEDbOFGgqxg45Z8QBKz1SQi8QIDjQmw/viewform?usp=header) returned HTTP 401 to the unauthenticated reader in this audit. An in-app browser attempt was unavailable. No content behind that sign-in was inferred, and no form was submitted.
- The current [school registration page](https://youthecosummit.com/school-registration/) still labels itself 2026. Its school/address/contact fields do not supply current competition rules.

## Why the local page showed two cards

Read-only response from `http://127.0.0.1:3010/api/public/config` returned exactly two approved records titled `LOCAL TEST — Environmental ideas`. One belonged to an open local test edition, the other to an archived local test edition. Both guidelines explicitly identify them as synthetic submission-workflow verification.

`scripts/verify-local-integration.ts` creates one fresh synthetic edition and one challenge per run. It archives earlier test editions but retains their records. `src/server/router.ts` selects approved competitions from every non-draft edition, including archived editions; the presentation previously rendered every returned record. Therefore two verification runs produced two cards. Those records should remain available to the local integration workflow while being excluded from the public marketing catalogue. The normal seed creates only unapproved content drafts; it never imports the official programme.

## Safe presentation and remaining configuration

Present the eight verified activity names in a clearly labelled **2026 programme / previous competitions** section, link the winner document, and keep the active catalogue driven by approved backend records. Use the explicitly named historical class tracks only as historical information. Do not assign Essay, Article or Blog eligibility based solely on the classes of winners.

The public sources inspected do not establish a complete 2027 activity catalogue, activity-specific themes, class rules, individual/team sizes, file formats/limits, opening/closing times, entry limits, rubrics or jury rules. These fields remain configuration inputs. The October 1 launch and September 30 delivery date are project milestones from the user’s meeting notes, not competition entry deadlines.
