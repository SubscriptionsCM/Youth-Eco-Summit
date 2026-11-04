# Participation photography

The participation cards use the original Youth Eco Summit photographs below, downloaded on 30 September 2026. The files in `public/images/participation/photos/` are unchanged source bytes. No generative model, background removal, retouching, face replacement, sharpening, or bitmap crop was used for these assets.

`src/components/participation-images.ts` records the shared sources, intrinsic dimensions, and presentation crops. `ParticipationArt` renders the sources using Next Image. The monochrome treatment, crop, small cream mat, purple paper backing, and mustard corner are CSS in `src/app/participation-photos.css`. Next Image may resize/compress delivery variants; it does not generate new people. The originals remain available in full resolution.

## Sources and intended crops

| Step | Original source | Local original | Dimensions | CSS framing |
| --- | --- | --- | --- | --- |
| Find your school | [P2176488.jpg](https://youthecosummit.com/wp-content/uploads/2025/12/P2176488.jpg) | `public/images/participation/photos/p2176488.jpg` | 3333 × 2222 | The three school students together; their faces, uniforms, and hands remain visible. Position 61% 39%, scale 1.45. |
| Register / Write it | [P2175892.jpg](https://youthecosummit.com/wp-content/uploads/2025/12/P2175892.jpg) | `public/images/participation/photos/p2175892.jpg` | 3333 × 2222 | The real auditorium group with notebooks and pens in the foreground. Position 56% 78%, scale 1.35. |
| Pick your challenge | [P2176389.jpg](https://youthecosummit.com/wp-content/uploads/2025/12/P2176389.jpg) | `public/images/participation/photos/p2176389.jpg` | 3333 × 2222 | Foreground-left student in checked uniform, looking down at the small soil container in her hands, with workshop context. Position 5% 100%, scale 1.5. |
| Submit your work | [P2176245.jpg](https://youthecosummit.com/wp-content/uploads/2025/12/P2176245.jpg) | `public/images/participation/photos/p2176245.jpg` | 3333 × 2222 | Central student in white kurta, orange scarf, and red backpack, preserving his downward glance, hands, pen, and paper. Position 56% 69%, scale 1.7. |
| Explore the summit | [DSC03872.jpg](https://youthecosummit.com/wp-content/uploads/2025/12/DSC03872.jpg) | `public/images/participation/photos/dsc03872.jpg` | 1714 × 1143 | A wider frame keeps the real group, microphones, and table together on stage. Position 50% 50%, scale 1. |

These photographs illustrate participation; they are not evidence of online registration or submission by the pictured individuals. Adjacent UI headings provide the action labels. The repeated decorative images therefore use empty alt text and an `aria-hidden` wrapper. The homepage retains its tab labels, roving keyboard navigation, and associated detail panel.

## Integrity

SHA-256 of the downloaded original files:

```text
c8b0f3660675a70e96716741c084928d04bb93932683a653ed8f6953a5041933  p2176488.jpg
232452bd3d66bbb86459b975f97afb9b084abb4a7282d7120fda3a32637d8888  p2175892.jpg
b0cf8b1789ec6938093197e65bac73acf530e298a84b1f10b6bf3b2124aa29c6  p2176389.jpg
ea20aeb1595f89bc9aa5b91cb9b743c340449f9876ab47d4e8f2ff3ede3fe9df  p2176245.jpg
dd7dbc286be11c1fe54d217f7b88d50073b09294fb0b176ac80bb2f1a889c757  dsc03872.jpg
```

Earlier generated participation PNG files remain in the repository for history but are no longer consumed by `ParticipationArt` or the homepage participation row.
