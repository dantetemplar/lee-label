import type { Component } from 'solid-js'
import { Show, createEffect, createSignal } from 'solid-js'
import FloatingModal from './FloatingModal'

const ProjectSettingsModal: Component<{
  open: () => boolean
  projectName: () => string
  projectPath: () => string | null
  onClose: () => void
  onSave: (name: string) => void | Promise<void>
}> = (props) => {
  const [draft, setDraft] = createSignal('')
  const [displayPath, setDisplayPath] = createSignal('')
  const [saving, setSaving] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  createEffect(() => {
    if (props.open()) {
      setDraft(props.projectName())
      setError(null)
      const path = props.projectPath()
      if (path) {
        void window.api.paths.formatDisplay(path).then(setDisplayPath)
      } else {
        setDisplayPath('')
      }
    }
  })

  const handleSave = (): void => {
    const name = draft().trim()
    if (!name) {
      setError('Project name cannot be empty')
      return
    }

    setSaving(true)
    setError(null)
    void Promise.resolve(props.onSave(name))
      .then(() => props.onClose())
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to save project settings')
      })
      .finally(() => setSaving(false))
  }

  return (
    <FloatingModal
      open={props.open}
      onClose={props.onClose}
      labelledBy="project-settings-title"
      panelClass="max-w-2xl p-8"
    >
      <h2 id="project-settings-title" class="text-xl font-semibold">
        Project settings
      </h2>
      <div class="mt-6 space-y-4">
        <label class="block text-sm text-base-content/70">
          Name
          <input
            type="text"
            class="input input-bordered mt-2 w-full bg-base-100 font-inherit"
            value={draft()}
            disabled={saving()}
            onInput={(event) => setDraft(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                handleSave()
              }
            }}
          />
        </label>
        <div class="block text-sm text-base-content/70">
          Path
          <div class="field-readonly mt-2">{displayPath()}</div>
        </div>
        <Show when={error()}>
          <p class="text-sm text-error">{error()}</p>
        </Show>
      </div>
      <div class="mt-8 flex justify-end gap-2">
        <button type="button" class="btn btn-ghost" disabled={saving()} onClick={() => props.onClose()}>
          Cancel
        </button>
        <button type="button" class="btn btn-primary" disabled={saving()} onClick={handleSave}>
          Save
        </button>
      </div>
    </FloatingModal>
  )
}

export default ProjectSettingsModal
