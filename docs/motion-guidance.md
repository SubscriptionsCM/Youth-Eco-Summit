# Motion and FAQ interaction

Updated 29 September 2026.

## Applied timing

- Entrance copy: 350 ms, 10 px upward travel, ease-out, optional delay capped at 80 ms.
- Entrance media: 400 ms, 12 px travel. Both start as soon as the element approaches the viewport (98%) and run once.
- Hero text: 350 ms with a short 35 ms stagger.
- FAQ panel: 240 ms intrinsic-height transition; plus indicator: 180 ms. There is no bounce, overshoot or delayed click response.
- Existing small background/foreground parallax remains optional through the operating system's reduced-motion preference.

These are project choices, informed by Material's duration scale and relationship between travel distance, area and duration. Material is not being presented as a mandatory timing standard. [Material motion guidance and duration tokens](https://github.com/material-components/material-components-android/blob/master/docs/theming/Motion.md).

## Accessible disclosure

The reusable `AnimatedFAQ` component has a real button within a heading, `aria-expanded`, a unique `aria-controls` target and a visible focus indicator. Native buttons support Enter and Space. Users may keep multiple answers open, and closing one does not move focus away from its trigger. Collapsed answers are immediately `inert` and `aria-hidden`; after the closing transition, they are also visually hidden. No extra region landmarks are created for each short answer. [W3C accordion pattern](https://www.w3.org/WAI/ARIA/apg/patterns/accordion/).

Intrinsic CSS grid rows avoid guessed `max-height` values and clipped answers when text wraps, fonts finish loading or the viewport changes. CSS transitions reverse from their current state when the user toggles rapidly. GSAP recalculates section positions after a FAQ finishes changing height.

The system's reduced-motion preference disables entrances, parallax and FAQ transitions; content and controls remain available. [W3C reduced-motion technique](https://www.w3.org/WAI/WCAG22/Techniques/css/C39), [Animation from interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html).

## Integration

```tsx
import { AnimatedFAQ } from './animated-faq';

<AnimatedFAQ question="Is a school ID required?" index="02">
  Yes. Find your registered school before creating a student profile.
</AnimatedFAQ>
```

`index` and `className` are optional. The component imports its own styles and has scoped presentation for `.faq-questions` and `.editorial-faq-list` containers.
