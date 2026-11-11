import { createContext } from "react"
import type { KeyboardEvent } from "react"

// Embedded surfaces can keep portalled controls inside their theme boundary.
export const OverlayContainer = createContext<HTMLElement | undefined>(undefined)

// Roving focus must inspect the local root rather than document.activeElement.
export function moveShadowFocus(event: KeyboardEvent<HTMLElement>, selector: string, orientation: 'horizontal' | 'vertical', loop = true) {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
  const root = event.currentTarget.getRootNode()
  if (!(root instanceof ShadowRoot)) return
  const horizontal = orientation === 'horizontal'
  const backwards = horizontal ? 'ArrowLeft' : 'ArrowUp'
  const forwards = horizontal ? 'ArrowRight' : 'ArrowDown'
  if (![backwards, forwards, 'Home', 'End'].includes(event.key)) return
  const items = [...event.currentTarget.querySelectorAll<HTMLElement>(selector)]
    .filter(item => !item.matches(':disabled, [data-disabled], [aria-disabled="true"]') && item.getClientRects().length > 0)
  const index = items.findIndex(item => item === root.activeElement)
  if (index < 0 || !items.length) return
  let step = event.key === backwards ? -1 : 1
  if (horizontal && getComputedStyle(event.currentTarget).direction === 'rtl') step *= -1
  let next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : index + step
  next = loop ? (next + items.length) % items.length : Math.max(0, Math.min(items.length - 1, next))
  event.preventDefault()
  event.stopPropagation()
  items[next].focus()
}

// Radix's document-level loop sees the shadow host as the active element.
export function cycleOverlayFocus(event: KeyboardEvent<HTMLElement>) {
  if (event.defaultPrevented || event.key !== "Tab") return
  const root = event.currentTarget.getRootNode()
  if (!(root instanceof ShadowRoot)) return
  const controls = [...event.currentTarget.querySelectorAll<HTMLElement>("button, input, select, textarea, a[href], [tabindex]")]
    .filter(element => element.tabIndex >= 0 && !element.matches(":disabled") && element.getClientRects().length > 0)
  const first = controls[0]
  const last = controls[controls.length - 1]
  if (!first || !last) {
    event.preventDefault()
    return
  }
  if (event.shiftKey ? root.activeElement === first : root.activeElement === last) {
    event.preventDefault()
    if (event.shiftKey) last.focus()
    else first.focus()
  }
}
