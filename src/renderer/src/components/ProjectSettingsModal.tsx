import type { Component } from 'solid-js'
import { Show, createEffect, createSignal } from 'solid-js'
import type { ProjectSettings, SegmentationMode } from '../../../shared/segmentation'
import ConfirmDialog from './ConfirmDialog'
import FloatingModal from './FloatingModal'

const ProjectSettingsModal: Component<{
  open: () => boolean
  projectSettings: () => ProjectSettings
  projectPath: () => string | null
  onClose: () => void
  onSave: (settings: { name: string; segmentationMode: SegmentationMode }) => void | Promise<void>
}> = (props) => {
  const [draftName, setDraftName] = createSignal('')
  const [draftMode, setDraftMode] = createSignal<SegmentationMode>('instance')
  const [displayPath, setDisplayPath] = createSignal('')
  const [saving, setSaving] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [modeChangePrompt, setModeChangePrompt] = createSignal<SegmentationMode | null>(null)

  createEffect(() => {
    if (props.open()) {
      const settings = props.projectSettings()
      setDraftName(settings.name)
      setDraftMode(settings.segmentationMode)
      setError(null)
      setModeChangePrompt(null)
      const path = props.projectPath()
      if (path) {
        void window.api.paths.formatDisplay(path).then(setDisplayPath)
      } else {
        setDisplayPath('')
      }
    }
  })

  const applySave = (): void => {
    const name = draftName().trim()
    if (!name) {
      setError('Project name cannot be empty')
      return
    }

    setSaving(true)
    setError(null)
    void Promise.resolve(
      props.onSave({
        name,
        segmentationMode: draftMode()
      })
    )
      .then(() => props.onClose())
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to save project settings')
      })
      .finally(() => setSaving(false))
  }

  const handleModeChange = (mode: SegmentationMode): void => {
    if (mode === props.projectSettings().segmentationMode) {
      setDraftMode(mode)
      return
    }

    void window.api.project.getAnnotationStats().then((stats) => {
      if (stats.shapeCount > 0 || stats.semanticMaskCount > 0) {
        setModeChangePrompt(mode)
      } else {
        setDraftMode(mode)
      }
    })
  }

  const handleSave = (): void => {
    applySave()
  }

  return (
    <>
      <FloatingModal
        open={props.open}
        onClose={props.onClose}
        labelledBy="project-settings-title"
        panelClass="max-w-2xl p-8"
      >
        <h2 id="project-settings-title" class="text-xl font-semibold">
          Project settings
        </h2>
        <div class="mt-6 space-y-5">
          <label class="block text-sm text-base-content/70">
            Name
            <input
              type="text"
              class="input input-bordered mt-2 w-full bg-base-100 font-inherit"
              value={draftName()}
              disabled={saving()}
              onInput={(event) => setDraftName(event.currentTarget.value)}
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
            <div class="field-readonly mt-2 cursor-default">{displayPath()}</div>
          </div>

          <fieldset class="space-y-2">
            <legend class="text-sm text-base-content/70">Segmentation mode</legend>
            <label class="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="segmentation-mode"
                class="radio radio-sm"
                checked={draftMode() === 'instance'}
                disabled={saving()}
                onChange={() => handleModeChange('instance')}
              />
              Instance segmentation (brush to polygon)
            </label>
            <label class="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="segmentation-mode"
                class="radio radio-sm"
                checked={draftMode() === 'semantic'}
                disabled={saving()}
                onChange={() => handleModeChange('semantic')}
              />
              Semantic segmentation (class-id bitmap)
            </label>
          </fieldset>

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

      <ConfirmDialog
        open={() => modeChangePrompt() !== null}
        title={() => 'Change segmentation mode?'}
        message={() => (
          <>
            Existing annotations may be incompatible with the new mode and will not be migrated
            automatically. Continue?
          </>
        )}
        destructive
        onCancel={() => setModeChangePrompt(null)}
        onConfirm={() => {
          const mode = modeChangePrompt()
          if (mode) setDraftMode(mode)
          setModeChangePrompt(null)
        }}
      />
    </>
  )
}

export default ProjectSettingsModal
