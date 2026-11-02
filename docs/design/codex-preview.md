# Codex-inspired design preview

Status: Visual direction approved 2026-10-23; product-wide promotion authorized. This standalone sample remains the visual reference; active rules live in ui-system.md and implementation/verification status in spec 0011.

## Open and scope

Run `pnpm dev --host 127.0.0.1`, then open `http://127.0.0.1:1420/design-preview.html`.

The standalone [HTML entry](../../design-preview.html) renders the [React preview](../../src/design-preview.tsx). Sample records and all mutations are in memory; reloading resets them. It calls no native command and installs, enables or removes no real skill. The normal application entry remains unchanged.

The review toolbar opens the inventory, skill detail, uninstall confirmation and two-step installation review; it also switches light/dark mode and the existing 14/16/18px root-size options. Other navigation entries provide review feedback rather than pretending to implement additional pages.

## Approved treatment

- Neutral canvas and sidebar with quiet card surfaces; inverted monochrome primary actions; blue focus and switch state.
- System typography, 4px spacing scale, pill actions/navigation and rounded containers.
- Shared inventory Card/Header/Footer, measured InventoryToolbar, Tabs, Select, Switch, Checkbox and Tooltip compositions.
- Existing SkillDocument for Markdown/source, syntax highlighting and code copying.
- Existing AlertDialog for a short destructive decision and Modal/ModalActions for selection/review. The confirmation starts on Cancel and returns focus to its initiating control.
- One page scroll region; one owning Modal body scroll region. Toolbars compact secondary labels before allowing horizontal scrolling. Cards use equal grid rows and content-driven height.

Reference layout styles are grouped at the end of [index.css](../../src/index.css). Shared component styling has been promoted to ui/; the sample uses those same implementations. Tokens live on `body[data-design-preview]`, which also covers Portal content. Reference page classes use the `design-` prefix. Product appearance preferences are independent of this sample; all sample state is still in memory.

## Evidence and remaining review

The preview was opened in the in-app browser. Observed checks include dark inventory/detail/confirmation/installation views, light inventory, 18px typography at a 960px viewport, search empty results, selection-step disabled state, review navigation, and confirmation Escape/focus return. Browser screenshots are local review evidence under `.scratch/design-preview/`.

Verification passed: `pnpm build` (including TypeScript), a separate Vite bundle with `design-preview.html` as its input, and `git diff --check`. Both builds retain the existing large-chunk advisory. At 960px/18px, the measured toolbar compacts its secondary label and has no horizontal overflow; the page also has none. The light large-type installation dialog was visually inspected. This browser sample does not establish native Tauri rendering, vibrancy, installed application behavior, lifecycle execution, persistence, all existing palettes or exhaustive window-size acceptance. Product migration and native verification are tracked in [spec 0011](../specs/0011-codex-inspired-design-baseline.md).

## Promotion boundary

The user approved the visual direction and authorized project-wide styling on 2026-10-23. The accepted values now belong to the existing theme and shared component owners described by [ui-system.md](ui-system.md). Functional logic, native lifecycle operations, navigation and user-selected preferences remain outside the styling change. No dependency additions or Git commits are required by the rollout.

Reference: [third-party Codex design guidelines](https://codex-design.beacon.host/), inspected 2026-10-23; the user-supplied cross-project handoff document was treated as design evidence, not execution authorization.
