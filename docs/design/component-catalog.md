# Component catalog (Radix)

Status: Active selection reference, verified 2026-10-15 against the project's official `@shadcn` registry and local files. [UI design baseline](ui-system.md) owns visual rules and product compositions; this catalog owns available primitive names and installation status. Availability is not a product roadmap or permission to add unrelated UI.

## Read the status before using a component

- **Installed:** a local `src/components/ui/<name>.tsx` exists. Read its exports and project customizations, then import it; no installation is needed.
- **Add when needed:** the current Radix registry supplies an implementation, but there is no local wrapper yet. Add only the selected component through the shadcn workflow, preserve existing files and adapt it to the current tweakcn tokens before use.
- **Metadata only:** the registry lists an item but returns no implementation. Do not treat it as an importable or working component.

2026-10-15 registry snapshot: **64 entries = 26 installed + 37 add when needed + 1 metadata-only item (`form`)**. The original 25-file inventory was verified with the CLI; AlertDialog was added on 2026-10-17. `form` was inspected with `view`; it contains only name/type/schema metadata, so current forms should use Field composition. The generic `radix-ui` dependency alone does not supply the project's themed wrappers.

Product compositions: [Hint](../../src/components/hint.tsx) composes the installed Tooltip for ordinary hints and focusable disabled-control explanations; [OverflowText](../../src/components/overflow-text.tsx) reveals clipped text only. Placement and exceptions follow [the design baseline](ui-system.md). These are application compositions, not additional registry primitives.

2026-10-20 addition: the current official registry also provides `code-block` and `use-highlighted-code`. Installed `CodeBlock` through the CLI, retaining the existing Button; adapted its copy feedback for localization/errors and reused the project utility. Its highlighter loads bundled Shiki languages on demand. The older full-registry count above remains a dated snapshot.

2026-10-25 composition: Select exports SelectTriggerButton using the same trigger surface for hierarchical choices. Codex native-skill source filtering combines it with the installed DropdownMenu submenu/radio components; no additional primitive or dependency is installed.

2026-10-28 addition: installed the official Radix Collapsible wrapper through the CLI. Pi built-in extensions use it with the existing CardHeader/CardTitle and compact arrow Button, defaulting open. The removed skill-rule preview and its custom disclosure Button variant are no longer active compositions; no runtime dependency or theme override was added.

## Selection and integration

1. Select a component below, or an existing product composition in the design baseline. Fetch its applicable documentation and inspect the local exports/registry files. A catalog entry verifies availability; it does not mean its full API or rendering has been tested in this application.
2. For an absent primitive, use the official namespace with the documented package runner, for example `pnpm dlx shadcn@latest add @shadcn/textarea`. Keep `radix-nova` and the existing Radix base. Inspect the generated diff and dependencies; retain local customizations and the tweakcn token pipeline. Do not overwrite shared components or apply a new preset to obtain one control.
3. Compose it according to the design baseline, verify the affected states, then update installation status here. No bulk installation is required. Installed means present, not necessarily currently used.

Registry inspection commands (read-only):

```sh
pnpm exec shadcn info --json
pnpm exec shadcn search @shadcn --type ui --limit 200 --json
pnpm exec shadcn docs <name> --json
pnpm exec shadcn view @shadcn/<name>
```

`search` returned all 64 entries with `hasMore: false`. `docs` returned 58 reference entries. The remaining six were inspected through `view`: five contain implementation files; `form` is metadata only. For these five, the table links the verified registry source rather than inventing a documentation URL. Refresh the registry if requirements or upstream interfaces change. Exact installed dependency versions remain in the lockfile.

## Actions and selection

| Component | Use | Local status | Reference |
| --- | --- | --- | --- |
| `button` | Primary, secondary and icon actions | Installed | [Docs](https://ui.shadcn.com/docs/components/radix/button) |
| `button-group` | Related actions in one compact group | Add when needed | [Docs](https://ui.shadcn.com/docs/components/radix/button-group) |
| `toggle` | One pressed/unpressed choice | Installed | [Docs](https://ui.shadcn.com/docs/components/radix/toggle) |
| `toggle-group` | A short single/multiple option set | Installed | [Docs](https://ui.shadcn.com/docs/components/radix/toggle-group) |
| `checkbox` | Independent choices and list selection | Installed | [Docs](https://ui.shadcn.com/docs/components/radix/checkbox) |
| `radio-group` | One choice from a labeled set | Installed | [Docs](https://ui.shadcn.com/docs/components/radix/radio-group) |
| `switch` | Immediate enabled/disabled setting | Installed | [Docs](https://ui.shadcn.com/docs/components/radix/switch) |
| `slider` | A bounded numeric range | Add when needed | [Docs](https://ui.shadcn.com/docs/components/radix/slider) |

## Forms and input

| Component | Use | Local status | Reference |
| --- | --- | --- | --- |
| `field` | Accessible labels, control grouping and validation | Installed | [Docs](https://ui.shadcn.com/docs/components/radix/field) |
| `label` | Associate a label with a control | Installed | [Docs](https://ui.shadcn.com/docs/components/radix/label) |
| `input` | Single-line text, paths and search | Installed | [Docs](https://ui.shadcn.com/docs/components/radix/input) |
| `textarea` | Multiline text and rules | Installed | [Docs](https://ui.shadcn.com/docs/components/radix/textarea) |
| `input-group` | Input with integrated icons or actions | Add when needed | [Docs](https://ui.shadcn.com/docs/components/radix/input-group) |
| `input-otp` | Segmented one-time code entry | Add when needed | [Docs](https://ui.shadcn.com/docs/components/radix/input-otp) |
| `select` | A compact single-value selector | Installed | [Docs](https://ui.shadcn.com/docs/components/radix/select) |
| `native-select` | Browser-native select control | Add when needed | [Docs](https://ui.shadcn.com/docs/components/radix/native-select) |
| `combobox` | Searchable option selection | Add when needed | [Docs](https://ui.shadcn.com/docs/components/radix/combobox) |
| `form` | Registry metadata only; no implementation files returned. Use Field and the current forms guide | Metadata only | [Forms guide](https://ui.shadcn.com/docs/forms/react-hook-form) |

## Code display

| Component | Use | Local status | Reference |
| --- | --- | --- | --- |
| `code-block` | Language header, code content, copy action and optional line numbering/wrapping | Installed | [Docs](https://ui.shadcn.com/docs/components/radix/code-block) |

## Navigation and commands

| Component | Use | Local status | Reference |
| --- | --- | --- | --- |
| `tabs` | Switch peer sections in a page | Installed | [Docs](https://ui.shadcn.com/docs/components/radix/tabs) |
| `sidebar` | Application navigation and grouped entries | Installed | [Docs](https://ui.shadcn.com/docs/components/radix/sidebar) |
| `breadcrumb` | Show hierarchical navigation context | Add when needed | [Docs](https://ui.shadcn.com/docs/components/radix/breadcrumb) |
| `navigation-menu` | Grouped navigation links | Add when needed | [Docs](https://ui.shadcn.com/docs/components/radix/navigation-menu) |
| `menubar` | Application-style menu bar | Add when needed | [Docs](https://ui.shadcn.com/docs/components/radix/menubar) |
| `dropdown-menu` | Actions and secondary menus | Installed | [Docs](https://ui.shadcn.com/docs/components/radix/dropdown-menu) |
| `context-menu` | Contextual actions on right-click | Add when needed | [Docs](https://ui.shadcn.com/docs/components/radix/context-menu) |
| `command` | Command palette and searchable commands | Add when needed | [Docs](https://ui.shadcn.com/docs/components/radix/command) |
| `pagination` | Navigate paged results | Add when needed | [Docs](https://ui.shadcn.com/docs/components/radix/pagination) |
| `kbd` | Display keyboard shortcuts | Add when needed | [Docs](https://ui.shadcn.com/docs/components/radix/kbd) |

## Overlays and disclosure

| Component | Use | Local status | Reference |
| --- | --- | --- | --- |
| `dialog` | Focused tasks in a modal | Installed | [Docs](https://ui.shadcn.com/docs/components/radix/dialog) |
| `alert-dialog` | A decision requiring explicit confirmation | Installed | [Docs](https://ui.shadcn.com/docs/components/radix/alert-dialog) |
| `sheet` | Side panel for a focused task | Installed | [Docs](https://ui.shadcn.com/docs/components/radix/sheet) |
| `drawer` | Edge drawer interaction | Add when needed | [Docs](https://ui.shadcn.com/docs/components/radix/drawer) |
| `popover` | Click-open contextual help or controls | Installed | [Docs](https://ui.shadcn.com/docs/components/radix/popover) |
| `tooltip` | Short noninteractive help on hover/focus | Installed | [Docs](https://ui.shadcn.com/docs/components/radix/tooltip) |
| `hover-card` | Rich preview on hover/focus | Add when needed | [Docs](https://ui.shadcn.com/docs/components/radix/hover-card) |
| `accordion` | Related expandable sections | Add when needed | [Docs](https://ui.shadcn.com/docs/components/radix/accordion) |
| `collapsible` | One expandable region | Installed | [Docs](https://ui.shadcn.com/docs/components/radix/collapsible) |

## Content and layout

| Component | Use | Local status | Reference |
| --- | --- | --- | --- |
| `card` | Grouped content with header/content/actions | Installed | [Docs](https://ui.shadcn.com/docs/components/radix/card) |
| `item` | Structured content or action rows | Add when needed | [Docs](https://ui.shadcn.com/docs/components/radix/item) |
| `table` | Tabular records | Add when needed | [Docs](https://ui.shadcn.com/docs/components/radix/table) |
| `separator` | Separate groups or regions | Installed | [Docs](https://ui.shadcn.com/docs/components/radix/separator) |
| `aspect-ratio` | Keep media at a consistent ratio | Add when needed | [Docs](https://ui.shadcn.com/docs/components/radix/aspect-ratio) |
| `avatar` | Identity image with fallback | Add when needed | [Docs](https://ui.shadcn.com/docs/components/radix/avatar) |
| `carousel` | Sequential media/content navigation | Add when needed | [Docs](https://ui.shadcn.com/docs/components/radix/carousel) |
| `scroll-area` | A deliberately controlled scroll region | Add when needed | [Docs](https://ui.shadcn.com/docs/components/radix/scroll-area) |
| `resizable` | User-resizable panels | Installed; WorkshopWorkbench | [Docs](https://ui.shadcn.com/docs/components/radix/resizable) |
| `direction` | Direction context for RTL/LTR interfaces | Add when needed | [Docs](https://ui.shadcn.com/docs/components/radix/direction) |

## Feedback and state

| Component | Use | Local status | Reference |
| --- | --- | --- | --- |
| `alert` | Contextual actionable feedback | Installed | [Docs](https://ui.shadcn.com/docs/components/radix/alert) |
| `badge` | Compact category or state | Installed | [Docs](https://ui.shadcn.com/docs/components/radix/badge) |
| `empty` | Empty result or first-use state | Installed | [Docs](https://ui.shadcn.com/docs/components/radix/empty) |
| `skeleton` | Loading placeholders | Installed | [Docs](https://ui.shadcn.com/docs/components/radix/skeleton) |
| `spinner` | A compact busy indicator | Add when needed | [Docs](https://ui.shadcn.com/docs/components/radix/spinner) |
| `progress` | Progress of a bounded operation | Add when needed | [Docs](https://ui.shadcn.com/docs/components/radix/progress) |
| `sonner` | Transient notification/toast delivery | Installed | [Docs](https://ui.shadcn.com/docs/components/radix/sonner) |

## Dates and charts

| Component | Use | Local status | Reference |
| --- | --- | --- | --- |
| `calendar` | Date selection surface | Add when needed | [Docs](https://ui.shadcn.com/docs/components/radix/calendar) |
| `chart` | Charts composed with the supported chart library | Add when needed | [Docs](https://ui.shadcn.com/docs/components/radix/chart) |

## Conversation and structured content

| Component | Use | Local status | Reference |
| --- | --- | --- | --- |
| `attachment` | Attachment identity and metadata | Add when needed | [Registry source](https://ui.shadcn.com/r/styles/radix-nova/attachment.json) |
| `bubble` | Message content surface | Add when needed | [Registry source](https://ui.shadcn.com/r/styles/radix-nova/bubble.json) |
| `message` | Conversation message structure | Add when needed | [Registry source](https://ui.shadcn.com/r/styles/radix-nova/message.json) |
| `message-scroller` | Conversation scrolling and navigation | Add when needed | [Registry source](https://ui.shadcn.com/r/styles/radix-nova/message-scroller.json) |
| `marker` | Inline conversation status or separators | Add when needed | [Registry source](https://ui.shadcn.com/r/styles/radix-nova/marker.json) |
| `questionnaire` | Structured questions and responses | Add when needed | [Docs](https://ui.shadcn.com/docs/components/radix/questionnaire) |
| `trace` | Expandable execution/process trace | Add when needed | [Docs](https://ui.shadcn.com/docs/components/radix/trace) |
| `code-block` | Code content with appropriate presentation | Add when needed | [Docs](https://ui.shadcn.com/docs/components/radix/code-block) |

## Compositions rather than standalone registry items

A documented recipe may combine primitives and dependencies rather than supply a same-named local module. Date pickers commonly compose Calendar with Popover; data tables build on Table; typography uses a shared text hierarchy. Verify the actual recipe before adding dependencies or inventing an import name. The same applies to the project's AgentPicker, Modal, OverflowText and other existing business compositions, mapped in the design baseline.

Third-party registries, blocks and additional themes are outside this official UI snapshot. Search them when the task calls for them; registry choice must be explicit, and adopting a component must preserve the current design language.

2026-10-16: Added Sonner through the project shadcn CLI. Its local wrapper follows existing semantic theme tokens and uses the existing appearance system, without `next-themes`.

2026-10-17: AlertDialog added from official radix-nova CLI view after dry-run exposed an overwrite of the customized Button. Only the new wrapper was adopted; it uses local cn and Button. Compact confirmation variants retain semantic tokens with a unified surface and no divided footer. The 64-entry registry availability snapshot remains dated 2026-10-15; only local installation status was refreshed.

2026-11-04 workbench redesign: Button adds a navigation variant for compact rectangular file rows and aria-current selection; existing variants are unchanged. Workshop composes it with Collapsible instead of the application SidebarMenu. The conversation/files split and the inner preview/tree split use Resizable with independent bounds; no new registry component or dependency was installed.

2026-11-04 workshop file controls: shared Button/Hint actions provide open-folder, refresh and close; preview uses the reusable subtle-scrollbar utility based on the existing native page scroller. Creation metadata edits use the existing Modal/Field composition and keep generated skill documents unchanged. No new component or dependency.

2026-11-05 conversation composition: Card adds the borderless semantic composer variant; Button navigation supports data-highlighted for keyboard skill selection. Workbench uses existing Textarea plain, Popover, Hint and Button for the selected skill, keyboard menu and unified send/stop position; no new dependency.
