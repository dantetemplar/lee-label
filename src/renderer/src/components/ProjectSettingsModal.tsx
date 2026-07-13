import type { Component } from 'solid-js'
import { Show, createEffect, createMemo, createSignal, on } from 'solid-js'
import type { Label, LabelDeleteStats } from '../../../shared/annotations'
import { getLabelColor } from '../../../shared/label-color'
import type { ProjectSettings, SegmentationMode } from '../../../shared/segmentation'
import ConfirmDialog from './ConfirmDialog'
import FloatingModal from './FloatingModal'
import LabelPanel from './LabelPanel'

type SettingsDraft = {
  name: string
  segmentationMode: SegmentationMode
}

export type ProjectSettingsSaveInput = {
  name: string
  segmentationMode: SegmentationMode
  labels: Label[]
}

const DRAFT_LABEL_PREFIX = 'draft:'

function isDraftLabelId(id: string): boolean {
  return id.startsWith(DRAFT_LABEL_PREFIX)
}

function cloneLabels(labels: Label[]): Label[] {
  return labels.map((label) => ({ ...label }))
}

function serializeLabels(labels: Label[]): string {
  return JSON.stringify(
    labels.map((label) => ({
      id: label.id,
      name: label.name,
      color: label.color,
      shortcut: label.shortcut ?? null
    }))
  )
}

const ProjectSettingsModal: Component<{
  open: () => boolean
  projectSettings: () => ProjectSettings
  projectPath: () => string | null
  labels: () => Label[]
  onClose: () => void
  onSave: (settings: ProjectSettingsSaveInput) => void | Promise<void>
}> = (props) => {
  const [draftName, setDraftName] = createSignal('')
  const [draftMode, setDraftMode] = createSignal<SegmentationMode>('instance')
  const [baseline, setBaseline] = createSignal<SettingsDraft | null>(null)
  const [draftLabels, setDraftLabels] = createSignal<Label[]>([])
  const [baselineLabels, setBaselineLabels] = createSignal<Label[]>([])
  const [draftActiveLabelId, setDraftActiveLabelId] = createSignal<string | null>(null)
  const [displayPath, setDisplayPath] = createSignal('')
  const [saving, setSaving] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [labelError, setLabelError] = createSignal<string | null>(null)
  const [modeChangePrompt, setModeChangePrompt] = createSignal<SegmentationMode | null>(null)
  const [modeRadioSync, setModeRadioSync] = createSignal(0)

  const syncModeRadios = (): void => setModeRadioSync((n) => n + 1)
  const [labelDeletePrompt, setLabelDeletePrompt] = createSignal<{
    label: Label
    stats: LabelDeleteStats
  } | null>(null)

  createEffect(
    on(
      () => props.open(),
      (open) => {
        if (!open) {
          setBaseline(null)
          setBaselineLabels([])
          setDraftLabels([])
          setLabelDeletePrompt(null)
          return
        }
        const settings = props.projectSettings()
        const next: SettingsDraft = {
          name: settings.name,
          segmentationMode: settings.segmentationMode
        }
        const labels = cloneLabels(props.labels())
        setDraftName(next.name)
        setDraftMode(next.segmentationMode)
        setBaseline(next)
        setDraftLabels(labels)
        setBaselineLabels(cloneLabels(labels))
        setDraftActiveLabelId(labels[0]?.id ?? null)
        setError(null)
        setLabelError(null)
        setModeChangePrompt(null)
        setLabelDeletePrompt(null)
        const path = props.projectPath()
        if (path) {
          void window.api.paths.formatDisplay(path).then(setDisplayPath)
        } else {
          setDisplayPath('')
        }
      }
    )
  )

  const labelsDirty = createMemo(
    () => serializeLabels(draftLabels()) !== serializeLabels(baselineLabels())
  )

  const settingsDirty = createMemo(() => {
    const base = baseline()
    if (!base) return false
    return draftName().trim() !== base.name || draftMode() !== base.segmentationMode
  })

  const canSave = createMemo(() => {
    if (saving()) return false
    const name = draftName().trim()
    if (!name) return false
    if (!baseline()) return false
    return settingsDirty() || labelsDirty()
  })

  const removeDraftLabel = (id: string): void => {
    setDraftLabels((current) => {
      const next = current.filter((label) => label.id !== id)
      if (draftActiveLabelId() === id) {
        setDraftActiveLabelId(next[0]?.id ?? null)
      }
      return next
    })
  }

  const handleDraftCreate = async (name: string, color?: string): Promise<void> => {
    setLabelError(null)
    const trimmed = name.trim()
    if (!trimmed) return
    if (draftLabels().some((label) => label.name === trimmed)) {
      setLabelError('A label with this name already exists')
      return
    }

    const label: Label = {
      id: `${DRAFT_LABEL_PREFIX}${crypto.randomUUID()}`,
      name: trimmed,
      color: color?.trim() || getLabelColor(
        trimmed,
        draftLabels().map((item) => item.color)
      ),
      classId: 0,
      sortOrder: draftLabels().length
    }
    setDraftLabels((current) => [...current, label])
    setDraftActiveLabelId(label.id)
  }

  const handleDraftUpdate = async (label: Label): Promise<void> => {
    setLabelError(null)
    const trimmed = label.name.trim()
    if (!trimmed) return
    if (
      draftLabels().some((item) => item.id !== label.id && item.name === trimmed)
    ) {
      setLabelError('A label with this name already exists')
      return
    }

    setDraftLabels((current) =>
      current.map((item) =>
        item.id === label.id ? { ...label, name: trimmed } : item
      )
    )
  }

  const handleDraftDelete = async (id: string): Promise<void> => {
    setLabelError(null)
    const label = draftLabels().find((item) => item.id === id)
    if (!label) return

    if (isDraftLabelId(id)) {
      removeDraftLabel(id)
      return
    }

    try {
      const stats = await window.api.labels.getDeleteStats(id)
      setLabelDeletePrompt({ label, stats })
    } catch (err: unknown) {
      setLabelError(err instanceof Error ? err.message : 'Failed to load delete details')
    }
  }

  const applySave = (): void => {
    const name = draftName().trim()
    if (!name) {
      setError('Project name cannot be empty')
      return
    }
    if (!canSave()) return

    setSaving(true)
    setError(null)
    setLabelError(null)
    void Promise.resolve(
      props.onSave({
        name,
        segmentationMode: draftMode(),
        labels: cloneLabels(draftLabels())
      })
    )
      .then(() => props.onClose())
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to save project settings')
      })
      .finally(() => setSaving(false))
  }

  const handleModeChange = (mode: SegmentationMode): void => {
    if (mode === draftMode()) {
      syncModeRadios()
      return
    }

    // Reverting to the saved mode never needs a confirm.
    if (mode === baseline()?.segmentationMode) {
      setDraftMode(mode)
      syncModeRadios()
      return
    }

    void window.api.project.getAnnotationStats().then((stats) => {
      if (stats.shapeCount > 0 || stats.semanticMaskCount > 0) {
        setModeChangePrompt(mode)
        syncModeRadios()
      } else {
        setDraftMode(mode)
        syncModeRadios()
      }
    })
  }

  const cancelModeChange = (): void => {
    setModeChangePrompt(null)
    syncModeRadios()
  }

  const confirmModeChange = (): void => {
    const mode = modeChangePrompt()
    if (mode) setDraftMode(mode)
    setModeChangePrompt(null)
    syncModeRadios()
  }

  const handleSave = (): void => {
    applySave()
  }

  return (
    <>
      <FloatingModal
        open={props.open}
        onClose={props.onClose}
        onSubmit={() => {
          if (canSave()) handleSave()
        }}
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
              on:input={(event) => setDraftName(event.currentTarget.value)}
              on:blur={(event) => setDraftName(event.currentTarget.value.trim())}
              on:keydown={(event) => {
                if (event.key !== 'Enter') return
                event.preventDefault()
                event.stopPropagation()
                setDraftName(event.currentTarget.value.trim())
                event.currentTarget.blur()
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
                prop:checked={modeRadioSync() >= 0 && draftMode() === 'instance'}
                disabled={saving()}
                on:click={(event) => {
                  event.preventDefault()
                  handleModeChange('instance')
                }}
              />
              Instance segmentation (brush to polygon)
            </label>
            <label class="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="segmentation-mode"
                class="radio radio-sm"
                prop:checked={modeRadioSync() >= 0 && draftMode() === 'semantic'}
                disabled={saving()}
                on:click={(event) => {
                  event.preventDefault()
                  handleModeChange('semantic')
                }}
              />
              Semantic segmentation (class-id bitmap)
            </label>
          </fieldset>

          <div class="flex h-64 w-[var(--sidebar-width)] flex-col overflow-hidden rounded-lg border border-base-content/10 bg-base-200">
            <LabelPanel
              labels={draftLabels}
              activeLabelId={draftActiveLabelId}
              onSelect={setDraftActiveLabelId}
              onCreate={handleDraftCreate}
              onUpdate={handleDraftUpdate}
              onDelete={handleDraftDelete}
              showShortcuts={() => false}
              error={labelError}
            />
          </div>

          <Show when={error()}>
            <p class="text-sm text-error">{error()}</p>
          </Show>
        </div>
        <div class="mt-8 flex justify-end gap-2">
          <button type="button" class="btn btn-ghost" disabled={saving()} onClick={() => props.onClose()}>
            Cancel
          </button>
          <button
            type="button"
            class="btn btn-primary"
            classList={{ 'btn-disabled': !canSave() }}
            disabled={!canSave()}
            onClick={handleSave}
          >
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
        onCancel={cancelModeChange}
        onConfirm={confirmModeChange}
      />

      <ConfirmDialog
        open={() => labelDeletePrompt() !== null}
        title={() => {
          const label = labelDeletePrompt()?.label
          return label ? `Do you want to delete "${label.name}" label?` : ''
        }}
        message={() => {
          const prompt = labelDeletePrompt()
          if (!prompt) return ''
          const { fileCount, instanceCount } = prompt.stats
          return (
            <>
              This label will be removed when you save. All annotations ({fileCount} files,{' '}
              {instanceCount} instances) associated to the label will be deleted.
            </>
          )
        }}
        destructive
        onCancel={() => setLabelDeletePrompt(null)}
        onConfirm={() => {
          const id = labelDeletePrompt()?.label.id
          setLabelDeletePrompt(null)
          if (id) removeDraftLabel(id)
        }}
      />
    </>
  )
}

export default ProjectSettingsModal
