# Youth Eco Summit source audit

Verified against the existing Youth Eco Summit website on 29 September 2026. Source files were downloaded unchanged; no new logos, SVGs, people, speaker identities or award results were generated.

## Editorial decisions and ambiguities

- The live homepage lists these nine organisations under **Our Allies**. This establishes an existing association, not a newly confirmed 2027 sponsorship tier. Display them together without inventing tier or contract labels.
- `EAIT-logo-1.jpg` visibly reads **Ministry of Electronics and Information Technology**. The data uses the organisation name visible in the logo, not the ambiguous filename.
- The ten speaker cards are original **Jaipur 2026 / 29 January 2026** posters. Roles are transcribed from those posters and are historical descriptions for that summit. **Shruti Sodhi** is labelled presenter on her poster; her role preserves that distinction.
- `Surender-Kumar.png` visibly names **Surendra Kumar Gotherwal**. The data uses the poster name.
- The original speaker carousel links the official YES YouTube channel for every card; it does not supply individual talk URLs. These remain channel links.
- All six winner PDFs have been opened, text-extracted and their first pages rendered and visually inspected. The four medal/special-mention documents are **2025**, not 2026. Document bytes are unchanged.
- The eight 2027 experience headings and descriptions come from the current homepage. Accidental editorial text (“please write this line exact as it is”) was removed from the awards paragraph, and the duplicated grammar in the Mini-COP sentence was corrected. No new programme promise was added.
- Most experience cards now use genuine photos from the existing summit gallery rather than illustrative stock-looking source cutouts. These are **scenes from previous summits**, not photographs of 2027. The Mini-COP card retains the current site’s own speaking-participant artwork. The school-stage photograph shows a performance, not a verified Mini-COP session.
- The homepage says **2027** while its Event page still advertises **29 January 2026** in Jaipur. Do not reuse the 2026 date or venue as a 2027 announcement. **Mini-COP 30** is retained as the source programme name; the 2027 team should confirm that label when finalising the programme.
- Instagram appears with two handles in duplicated site markup. The visible primary/header and footer link is `youth.eco.summit`; that is the selected link. YouTube is `@youthecosummit`.
- Gallery photo DSC05052 visibly identifies Ananya Panday on her stage nameplate and Mumbai 2025 on the backdrop. Specific Ananya/Tecno promotional reel URLs were not present in the inspected homepage/Event/News pages, so none were invented.

## Sources

- [Current homepage: partners, 2026 speaker cards, experience categories and winner documents](https://youthecosummit.com/)
- [Current Event page: historical summit information](https://youthecosummit.com/event/)
- [News & Views: original outgoing press links](https://youthecosummit.com/news-views/)

## Files used by the frontend

| Local file | Original source |
| --- | --- |
| `/images/summit/speaker-milind-soman.png` | [Milind-Soman.png](https://youthecosummit.com/wp-content/uploads/2026/01/Milind-Soman.png) |
| `/images/summit/speaker-neha-raghav.png` | [Neha-Raghav.png](https://youthecosummit.com/wp-content/uploads/2026/01/Neha-Raghav.png) |
| `/images/summit/speaker-nelson-paes.png` | [Nelson-Paes.png](https://youthecosummit.com/wp-content/uploads/2026/01/Nelson-Paes.png) |
| `/images/summit/speaker-pankti-pandey.png` | [Pankti-Pandey.png](https://youthecosummit.com/wp-content/uploads/2026/01/Pankti-Pandey.png) |
| `/images/summit/speaker-prasiddhi-singh.png` | [Prasiddhi-Singh.png](https://youthecosummit.com/wp-content/uploads/2026/01/Prasiddhi-Singh.png) |
| `/images/summit/speaker-rohit-saraf.png` | [Rohit-Saraf.png](https://youthecosummit.com/wp-content/uploads/2026/01/Rohit-Saraf.png) |
| `/images/summit/speaker-sanjana-sanghi.png` | [Sanjana-Sanghi.png](https://youthecosummit.com/wp-content/uploads/2026/01/Sanjana-Sanghi.png) |
| `/images/summit/speaker-shruti-sodhi.png` | [Shruti-Sodhi.png](https://youthecosummit.com/wp-content/uploads/2026/01/Shruti-Sodhi.png) |
| `/images/summit/speaker-surender-kumar.png` | [Surender-Kumar.png](https://youthecosummit.com/wp-content/uploads/2026/01/Surender-Kumar.png) |
| `/images/summit/speaker-viraansh-bhanushali.png` | [Viraansh-Bhanushali.png](https://youthecosummit.com/wp-content/uploads/2026/01/Viraansh-Bhanushali.png) |
| `/images/summit/partner-unicef-logo.jpg` | [Unicef-logo-1.jpg](https://youthecosummit.com/wp-content/uploads/2025/12/Unicef-logo-1.jpg) |
| `/images/summit/partner-wwf-logo.jpg` | [wwf-logo-1.jpg](https://youthecosummit.com/wp-content/uploads/2025/12/wwf-logo-1.jpg) |
| `/images/summit/partner-moefcc-logo.jpg` | [MoEFCC-logo-1.jpg](https://youthecosummit.com/wp-content/uploads/2025/12/MoEFCC-logo-1.jpg) |
| `/images/summit/partner-meri-lifew-logo.jpg` | [Meri-lifew-logo-1.jpg](https://youthecosummit.com/wp-content/uploads/2025/12/Meri-lifew-logo-1.jpg) |
| `/images/summit/partner-bigfm-logo.jpg` | [bigfm-logo-1.jpg](https://youthecosummit.com/wp-content/uploads/2025/12/bigfm-logo-1.jpg) |
| `/images/summit/partner-eait-logo.jpg` | [EAIT-logo-1.jpg](https://youthecosummit.com/wp-content/uploads/2025/12/EAIT-logo-1.jpg) |
| `/images/summit/partner-kiran-nadar.jpg` | [Kiran-Nadar-1.jpg](https://youthecosummit.com/wp-content/uploads/2025/12/Kiran-Nadar-1.jpg) |
| `/images/summit/partner-toi-logo.jpg` | [TOI-logo-1.jpg](https://youthecosummit.com/wp-content/uploads/2025/12/TOI-logo-1.jpg) |
| `/images/summit/partner-scgj-logo.jpg` | [SCGJ-logo.jpg](https://youthecosummit.com/wp-content/uploads/2026/01/SCGJ-logo.jpg) |
| `/images/summit/expect-7.png` | [11.png](https://youthecosummit.com/wp-content/uploads/2026/01/11.png) |
| `/documents/winners/Final-Winner-sheet2026.pdf` | [Final-Winner-sheet2026.pdf](https://youthecosummit.com/wp-content/uploads/2026/02/Final-Winner-sheet2026.pdf) |
| `/documents/winners/Gold-Medalists_Youth-Eco-Summit-2025.pdf` | [Gold-Medalists_Youth-Eco-Summit-2025.pdf](https://youthecosummit.com/wp-content/uploads/2025/11/Gold-Medalists_Youth-Eco-Summit-2025.pdf) |
| `/documents/winners/Silver-Medalists_Youth-Eco-Summit-2025.pdf` | [Silver-Medalists_Youth-Eco-Summit-2025.pdf](https://youthecosummit.com/wp-content/uploads/2025/11/Silver-Medalists_Youth-Eco-Summit-2025.pdf) |
| `/documents/winners/Bronze-Medalists_Youth-Eco-Summit-2025.pdf` | [Bronze-Medalists_Youth-Eco-Summit-2025.pdf](https://youthecosummit.com/wp-content/uploads/2025/11/Bronze-Medalists_Youth-Eco-Summit-2025.pdf) |
| `/documents/winners/Special-Mention_Youth-Eco-Summit-2025.pdf` | [Special-Mention_Youth-Eco-Summit-2025.pdf](https://youthecosummit.com/wp-content/uploads/2025/11/Special-Mention_Youth-Eco-Summit-2025.pdf) |
| `/documents/winners/Winners_Youth-Eco-Summit-2024-2.pdf` | [Winners_Youth-Eco-Summit-2024-2.pdf](https://youthecosummit.com/wp-content/uploads/2026/01/Winners_Youth-Eco-Summit-2024-2.pdf) |
| `/images/summit/gallery-p2176584.jpg` | [P2176584-1024x683.jpg](https://youthecosummit.com/wp-content/uploads/2025/12/P2176584-1024x683.jpg) |
| `/images/summit/gallery-p2176488.jpg` | [P2176488-1024x683.jpg](https://youthecosummit.com/wp-content/uploads/2025/12/P2176488-1024x683.jpg) |
| `/images/summit/gallery-p2176165.jpg` | [P2176165-1024x683.jpg](https://youthecosummit.com/wp-content/uploads/2025/12/P2176165-1024x683.jpg) |
| `/images/summit/gallery-p2176237.jpg` | [P2176237-1024x683.jpg](https://youthecosummit.com/wp-content/uploads/2025/12/P2176237-1024x683.jpg) |
| `/images/summit/gallery-p2176389.jpg` | [P2176389-1024x683.jpg](https://youthecosummit.com/wp-content/uploads/2025/12/P2176389-1024x683.jpg) |
| `/images/summit/gallery-p2176141.jpg` | [P2176141-1024x683.jpg](https://youthecosummit.com/wp-content/uploads/2025/12/P2176141-1024x683.jpg) |
| `/images/summit/gallery-p2176130.jpg` | [P2176130-1024x683.jpg](https://youthecosummit.com/wp-content/uploads/2025/12/P2176130-1024x683.jpg) |
| `/images/summit/gallery-dsc04966.jpg` | [DSC04966-1024x683.jpg](https://youthecosummit.com/wp-content/uploads/2025/12/DSC04966-1024x683.jpg) |
| `/images/summit/gallery-dsc05052.jpg` | [DSC05052-1024x683.jpg](https://youthecosummit.com/wp-content/uploads/2025/12/DSC05052-1024x683.jpg) |
| `/images/summit/gallery-dsc05186.jpg` | [DSC05186-1024x683.jpg](https://youthecosummit.com/wp-content/uploads/2025/12/DSC05186-1024x683.jpg) |
| `/images/summit/gallery-dsc03849.jpg` | [DSC03849-1024x683.jpg](https://youthecosummit.com/wp-content/uploads/2025/12/DSC03849-1024x683.jpg) |
| `/images/summit/gallery-dsc03872.jpg` | [DSC03872-1024x683.jpg](https://youthecosummit.com/wp-content/uploads/2025/12/DSC03872-1024x683.jpg) |
| `/images/summit/gallery-3y5a9656.jpg` | [3Y5A9656-1024x683.jpg](https://youthecosummit.com/wp-content/uploads/2025/12/3Y5A9656-1024x683.jpg) |

## Winner verification

| Document | Year confirmed on first page | Pages | SHA-256 |
| --- | --- | --- | --- |
| 2026 winners | 2026 | 4 | `a6fe8ad2c8084ae7bd41beae0639896279bd4ef2609f83559ccdcce3e1b98d42` |
| Gold medalists | 2025 | 2 | `0a6ab529e5c1ac0f3c13c6db78c0e31c3ab4d97f3b506f274ee33ccaa1604864` |
| Silver medalists | 2025 | 1 | `b12128cfa8cf08804029e8816098f3a308d9313704af769d861bfc77d2aeece1` |
| Bronze medalists | 2025 | 1 | `755f8fdea09daeb107deff6f39afad390add3bfdce816dfbd2d2892c09d04016` |
| Special mentions | 2025 | 4 | `985bc54321d0d63c75750b3a79e3238dc3bbb9235a236bcb67ef7cc52ff3669c` |
| 2024 winners | 2024 | 4 | `29426f2e33a411e259d15510841bce71ad04fc60059be0e31fcad454871870ff` |

## Press links

The following original News & Views links were opened and their article titles verified. Shortened card titles retain their subject.
- [The Financial Express: Students at the forefront as e-waste eco-warriors](https://www.financialexpress.com/jobs-career/education-bajaj-foundation-aims-to-puts-students-in-forefront-as-e-waste-eco-warriorsnbsp-3368957/)
- [India CSR: Youth-centric Eco Summit empowers students](https://indiacsr.in/csr-bajaj-foundation-youth-centric-eco-summit/)
- [The Interview World: Redefining environmental leadership by empowering youth](https://theinterview.world/redefining-environmental-leadership-by-empowering-youth/)

## Asset checks

Every data-module image and PDF exists locally. The nine logo files are original 618 × 202 raster JPEGs. Speaker posters are original portrait PNGs (595 pixels wide and 741–744 pixels high). Gallery photos remain original downloadable raster files. Additional original category illustrations and gallery photographs are retained in `public/images/summit/` for future content pages; they are not all loaded on the homepage.

The verified student hero-card option is `/images/summit/gallery-dsc03872.jpg`, 1024 × 683: students speaking into YES microphones during a stage performance.
