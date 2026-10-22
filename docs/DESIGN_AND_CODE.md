# Design and code
Create a modern, premium, responsive design matching the brand and assets.
Keep code readable, maintainable, accessible, secure, and performant.

Build fluid, content-driven layouts around available space, with layout
breakpoints where the design naturally needs to change. Combine root `rem`
scaling with `%`, `fr`, `minmax()`, `auto-fit`, `auto-fill`, intrinsic sizing,
and container queries as appropriate. Keep components reusable across
different layouts and container sizes.

Set root scaling in `globals.css` by CSS viewport width. Use `16px` below
`1920px`, including widths at or below `1600px`. Apply each minimum-width
override below until the next breakpoint, scaling `rem`-based UI
proportionally.

| Minimum viewport width | `1rem` |
| --- | --- |
| Default | `16px` |
| `1920px` | `18px` |
| `2560px` | `24px` |
| `3200px` | `28px` |
| `3840px` | `34px` |
| `4800px` and above | `40px` |

Values assume a `16px` browser default; preserve user font preferences and
verify usability with browser zoom, OS scaling, accessibility settings,
and high-DPI displays.

Let larger layouts gain width, columns, spacing, and proportional UI scale.
Use `max-width` for readability or composition without overly restricting
large layouts. Balance very narrow through extremely large spaces, avoiding
overflow, excessive stretching, tiny or oversized UI, unreadably long lines,
and unnecessary empty space. Base layout changes on available space rather
than device resolutions so they adapt as screen sizes evolve.

Follow the project's styling conventions where practical. Colocated CSS
Modules are a preferred starting point for styled TSX components; choose
another approach when it better fits the project. Review existing global
styles and keep defaults, such as the body background, consistent with that
styling system.

Use shared design tokens in `globals.css` for typography, spacing, sizing,
icons, controls, interaction targets, radii, and other scalable values so
they can be adjusted consistently across the interface.

Control all font sizes from `globals.css` through shared CSS variables or
global typography rules. Avoid hardcoded component font sizes unless clearly
justified. Keep font sizes between `1rem` and `2.6rem` at every breakpoint;
do not use `clamp()` for typography.

Use Lucide Icons as the preferred icon set, installing the appropriate
package when needed. Keep icon style and meaning consistent throughout the
interface. Replace redundant text with intuitive icons where this improves
clarity and reduces clutter.
Keep visible labels when they help users understand an action, and give
icon-only controls accessible names.

Limit hover effects to input that supports true hover. Use tap, active, and
appropriate focus states for touch interactions. Prevent hover styles from
sticking after taps, including on devices with mixed inputs, and keep
keyboard focus visible.

Build smooth, accessible frontend and CMS drawers with responsive sizing,
consistent styling, and performant `transform`/`opacity` animations; respect
reduced-motion preferences. Support keyboard and touch operation. For
dismissible drawers, support Escape to close and manage initial focus and
focus restoration appropriately. For modal drawers, contain focus and
prevent background scrolling while keeping drawer content scrollable.

Use a responsive edge drawer for frontend mobile navigation, entering and
exiting from a screen edge rather than opening as a centered dialog.

Prioritize visual polish for frontend drawers and clarity/efficiency for
CMS drawers. Share common behavior where useful, keeping individual drawers
straightforward to customize.

On the Routes page, use an interactive geographic map that supports pointer,
touch, and keyboard use. Keep map attribution visible, and distinguish
illustrative connections from verified navigational or live service data.

Authorize privileged operations and keep secrets server-side.
