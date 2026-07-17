export function focusComposerInput(
  input: HTMLTextAreaElement,
  schedule: typeof requestAnimationFrame = requestAnimationFrame
): void {
  schedule(() => {
    if (!input.disabled && input.isConnected) {
      input.focus({ preventScroll: true })
    }
  })
}
