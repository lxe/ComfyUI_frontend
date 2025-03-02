<template>
  <SidebarTabTemplate :title="$t('sideToolbar.stackWorkflow')">
    <template #body>
      <div class="stack-workflow-controls">
        <div class="filter-toggle">
          <Checkbox v-model="showEmptyNodes" :binary="true" />
          <label>Show empty nodes</label>
        </div>
      </div>
      <div class="stack-workflow">
        <div
          v-for="node in filteredNodes"
          :key="node.id"
          class="node-card"
          :class="{
            'is-save-image': isSaveImageNode(node)
          }"
          :style="{
            '--node-custom-color': getNodeColor(node),
            '--node-custom-text-color': getNodeTextColor(node)
          }"
        >
          <div class="node-header" @click="toggleNodeCollapse(node)">
            <div class="header-content">
              <span
                class="toggle-icon"
                :class="{ expanded: !isNodeCollapsed(node) }"
                >▶</span
              >
              <h3>{{ node.title || node.type }}</h3>
            </div>
            <div
              v-if="hasConnections(node)"
              class="connection-indicator"
              @click.stop="showConnectionsPopup($event, node)"
              role="button"
            >
              {{ getConnectionCount(node) }}
            </div>
          </div>

          <div v-show="!isNodeCollapsed(node)" class="node-content">
            <!-- Preview Image for Save Image Node -->
            <div v-if="isSaveImageNode(node)" class="node-section">
              <div
                class="preview-image-container"
                @click="handleImageClick(node)"
                role="button"
              >
                <img
                  v-if="getPreviewImageUrl(node)"
                  :src="getPreviewImageUrl(node)"
                  class="preview-image"
                  alt="Preview"
                />
                <div v-else class="no-preview">No preview available</div>
              </div>
            </div>

            <!-- User Inputs Section -->
            <div v-if="node.widgets_values?.length" class="node-section">
              <div class="input-list">
                <div
                  v-for="(value, index) in node.widgets_values"
                  :key="index"
                  class="widget-input"
                >
                  <label
                    v-if="getWidgetLabel(node, index)"
                    class="widget-label"
                  >
                    {{ getWidgetLabel(node, index) }}
                  </label>
                  <component
                    :is="getWidgetComponent(node, index)"
                    v-model="node.widgets_values[index]"
                    v-bind="getWidgetProps(node, index)"
                    @update:modelValue="handleWidgetUpdate(node, index, $event)"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </SidebarTabTemplate>
  <ResultGallery
    v-model:activeIndex="galleryActiveIndex"
    :allGalleryItems="allGalleryItems"
  />

  <!-- Connections Popup -->
  <OverlayPanel ref="connectionsPanel" class="connections-panel">
    <template v-if="selectedNode">
      <!-- Input Connections -->
      <div
        v-if="selectedNode.inputs?.some((input) => input.link)"
        class="connection-group"
      >
        <h5 class="connection-group-title">Inputs From</h5>
        <div
          v-for="input in selectedNode.inputs"
          :key="input.name"
          class="connection-item"
        >
          <template v-if="input.link">
            <span class="connection-name">{{ input.name }}</span>
            <span class="connection-type">{{ input.type }}</span>
          </template>
        </div>
      </div>

      <!-- Output Connections -->
      <div
        v-if="selectedNode.outputs?.some((output) => output.links?.length)"
        class="connection-group"
      >
        <h5 class="connection-group-title">Outputs To</h5>
        <div
          v-for="output in selectedNode.outputs"
          :key="output.name"
          class="connection-item"
        >
          <template v-if="output.links?.length">
            <span class="connection-name">{{ output.name }}</span>
            <span class="connection-count"
              >({{ output.links.length }} node{{
                output.links.length > 1 ? 's' : ''
              }})</span
            >
          </template>
        </div>
      </div>
    </template>
  </OverlayPanel>
</template>

<script setup lang="ts">
import Checkbox from 'primevue/checkbox'
import Dropdown from 'primevue/dropdown'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import OverlayPanel from 'primevue/overlaypanel'
import Slider from 'primevue/slider'
import Textarea from 'primevue/textarea'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import ResultGallery from '@/components/sidebar/tabs/queue/ResultGallery.vue'
import { app } from '@/scripts/app'
import { useDialogStore } from '@/stores/dialogStore'
import { useNodeOutputStore } from '@/stores/imagePreviewStore'
import { useNodeDefStore } from '@/stores/nodeDefStore'

import SidebarTabTemplate from './SidebarTabTemplate.vue'

// Define base types
interface Point {
  0: number
  1: number
}

interface Size {
  0: number
  1: number
}

interface NodeWidget {
  name: string
  type: string
  value: any
  options?: {
    min?: number
    max?: number
    step?: number
    precision?: number
    values?: string[]
    multiline?: boolean
    display?: string
  }
  callback?: (value: any) => void
}

interface NodeInput {
  name: string
  type: string
  link?: any
  slot_index?: number
}

interface NodeOutput {
  name: string
  type: string
  links?: any[]
  slot_index?: number
}

interface LGraphNode {
  id: string | number
  type: string
  title?: string
  pos: Point | [number, number]
  size: Size | [number, number]
  widgets?: NodeWidget[]
  inputs?: NodeInput[]
  outputs?: NodeOutput[]
  serialize: () => any
  imageData?: any
  color?: string
  color_text?: string
  flags?: any
  mode?: number
  order?: number
  properties?: any
}

interface LGraph {
  nodes: LGraphNode[]
  onNodeAdded: ((node: LGraphNode) => void) | null
  onNodeRemoved: ((node: LGraphNode) => void) | null
  onConnectionChange: ((node: LGraphNode) => void) | null
  setDirtyCanvas: (a: boolean, b: boolean) => void
  callback_event?: (event: string, node?: any, widget?: any, pos?: any) => void
  _imageCheckInterval?: ReturnType<typeof setInterval>
}

// Update ComfyNode interface
interface ComfyNode {
  id: string | number
  type?: string
  title?: string
  pos?: [number, number]
  size?: [number, number]
  order?: number
  widgets_values?: any[]
  inputs?: any[] // Make this more permissive to handle serialized types
  outputs?: any[] // Make this more permissive to handle serialized types
  _node?: LGraphNode
  isConnected?: boolean
  flags?: any
  mode?: number
  properties?: any
}

const nodeDefStore = useNodeDefStore()
const nodeOutputStore = useNodeOutputStore()
const dialogStore = useDialogStore()
const nodes = ref<ComfyNode[]>([])
const isGraphReady = ref(false)
const galleryActiveIndex = ref(-1)
const allGalleryItems = ref([])
const showEmptyNodes = ref(true)
const expandedConnections = ref(new Set<string>())
const collapsedNodes = ref(new Set<string>())
const connectionsPanel = ref()
const selectedNode = ref<ComfyNode | null>(null)

const sortedNodes = computed(() => {
  return [...nodes.value].sort((a, b) => (a.order || 0) - (b.order || 0))
})

const isNodeEmpty = (node: ComfyNode) => {
  // Check if node has any non-empty widget values that are editable
  const hasEditableWidgets =
    node.widgets_values?.some((value) => {
      if (value === null || value === undefined || value === '') return false
      if (typeof value === 'number' && value === 0) return false
      if (typeof value === 'string' && value.trim() === '') return false
      return true
    }) ?? false

  // Check if it's a Save Image node with a preview
  const hasPreview = isSaveImageNode(node) && getPreviewImageUrl(node)

  // Check if it's a node that processes images (might have visible outputs)
  const isImageProcessor =
    node.inputs?.some(
      (input) =>
        input.type === 'IMAGE' || input.name?.toLowerCase().includes('image')
    ) ?? false

  // A node is empty if it has no user-editable content or visible outputs
  return !hasEditableWidgets && !hasPreview && !isImageProcessor
}

const filteredNodes = computed(() => {
  if (showEmptyNodes.value) {
    return sortedNodes.value
  }

  return sortedNodes.value.filter((node) => !isNodeEmpty(node))
})

const updateNodes = () => {
  if (!isGraphReady.value || !app?.graph?.nodes) {
    console.log('Graph not ready or no nodes available')
    nodes.value = []
    return
  }

  // Create a new array to ensure Vue detects the change
  nodes.value = app.graph.nodes.map((node) => {
    const serialized = node.serialize()
    return {
      ...serialized,
      id: String(serialized.id), // Ensure ID is a string
      title: node.title || '',
      pos: serialized.pos as [number, number],
      size: serialized.size as [number, number],
      isConnected: node.inputs?.some((input) => input.link != null) || false,
      _node: node as LGraphNode
    }
  })
}

const getWidgetLabel = (node: ComfyNode & { _node?: any }, index: number) => {
  // Get the widget label directly from the node instance
  const widget = node._node?.widgets?.[index]
  if (!widget?.name) return null // Return null instead of a default label

  // Convert technical names to readable format if needed
  return widget.name
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim()
}

const getWidgetComponent = (
  node: ComfyNode & { _node?: any },
  index: number
) => {
  const widget = node._node?.widgets?.[index]
  if (!widget) return InputText

  // Check if this is a prompt input (they are always multiline)
  const isPromptInput =
    widget.name?.toLowerCase().includes('prompt') ||
    widget.name?.toLowerCase().includes('text') ||
    widget.type === 'customtext' ||
    (widget.options?.multiline ?? false)

  // Use the widget's actual type
  switch (widget.type) {
    case 'number':
      return widget.options?.display === 'slider' ? Slider : InputNumber
    case 'combo':
      return Dropdown
    case 'boolean':
      return Checkbox
    case 'text':
    case 'customtext':
      return isPromptInput ? Textarea : InputText
    default:
      return InputText
  }
}

const getWidgetProps = (node: ComfyNode & { _node?: any }, index: number) => {
  const widget = node._node?.widgets?.[index]
  if (!widget) return {}

  const baseProps = {
    class: 'w-full'
  }

  // Check if this is a prompt input
  const isPromptInput =
    widget.name?.toLowerCase().includes('prompt') ||
    widget.name?.toLowerCase().includes('text') ||
    widget.type === 'customtext' ||
    (widget.options?.multiline ?? false)

  switch (widget.type) {
    case 'number':
      return {
        ...baseProps,
        min: widget.options?.min ?? 0,
        max: widget.options?.max ?? 100000,
        step: widget.options?.step || (widget.options?.precision ? 0.1 : 1),
        modelValue: parseFloat(node.widgets_values?.[index]) || 0,
        useGrouping: false
      }
    case 'combo':
      return {
        ...baseProps,
        options: widget.options?.values || [],
        modelValue:
          node.widgets_values?.[index] || widget.options?.values?.[0] || '',
        optionLabel: (item: string) => item,
        optionValue: (item: string) => item
      }
    case 'boolean':
      return {
        ...baseProps,
        modelValue: Boolean(node.widgets_values?.[index])
      }
    case 'text':
    case 'customtext':
      if (isPromptInput) {
        return {
          ...baseProps,
          rows: 5,
          autoResize: true,
          style: 'min-height: 100px; resize: vertical;'
        }
      }
      return baseProps
    default:
      return baseProps
  }
}

const handleWidgetUpdate = (
  node: ComfyNode & { _node?: any },
  index: number,
  value: any
) => {
  if (node._node?.widgets?.[index]) {
    const widget = node._node.widgets[index]

    // Convert value based on widget type
    let processedValue = value
    if (widget.type === 'number') {
      processedValue = parseFloat(value)
      if (widget.options?.precision === 0) {
        processedValue = Math.round(processedValue)
      }
    } else if (widget.type === 'boolean') {
      processedValue = Boolean(value)
    }

    // Update both the widget and our local state
    widget.value = processedValue
    node.widgets_values[index] = processedValue

    // Trigger the widget's callback if it exists
    widget.callback?.(processedValue)

    // Mark canvas as dirty
    if (app?.graph) {
      app.graph.setDirtyCanvas(true, true)
    }
  }
}

const setupGraphListeners = () => {
  const graph = app?.graph as unknown as LGraph
  if (!graph) return

  graph.onNodeAdded = (node: LGraphNode) => {
    updateNodes()
    graph?.setDirtyCanvas(true, true)
  }

  graph.onNodeRemoved = (node: LGraphNode) => {
    updateNodes()
    graph?.setDirtyCanvas(true, true)
  }

  graph.onConnectionChange = (node: LGraphNode) => {
    updateNodes()
    graph?.setDirtyCanvas(true, true)
  }

  graph.callback_event = (
    event: string,
    node?: any,
    widget?: any,
    pos?: any
  ) => {
    if (event === 'clear') {
      updateNodes()
    } else if (event === 'nodeChange') {
      // If a specific node changed, update just that node
      if (node) {
        const nodeIndex = nodes.value.findIndex((n) => n.id === node.id)
        if (nodeIndex !== -1) {
          const serialized = node.serialize()
          nodes.value[nodeIndex] = {
            ...serialized,
            title: node.title || '',
            isConnected:
              node.inputs?.some((input) => input.link != null) || false,
            _node: node
          }
        }
      } else {
        updateNodes()
      }
    } else if (event === 'widget_changed') {
      // Handle widget value changes from the canvas
      if (node && widget) {
        const nodeIndex = nodes.value.findIndex((n) => n.id === node.id)
        if (nodeIndex !== -1) {
          const widgetIndex = node.widgets?.indexOf(widget)
          if (widgetIndex !== -1) {
            nodes.value[nodeIndex].widgets_values[widgetIndex] = widget.value
          }
        }
      }
    }

    graph?.setDirtyCanvas(true, true)
  }

  // Set up a periodic check for image data changes
  const checkImageData = () => {
    const nodesWithImages = graph.nodes.filter(
      (node) =>
        node.type === 'SaveImage' ||
        node.imageData ||
        node.inputs?.some(
          (input) => input.name === 'images' || input.type === 'IMAGE'
        )
    )

    if (nodesWithImages.length > 0) {
      updateNodes()
    }
  }

  // Check every second for image updates
  const imageCheckInterval = setInterval(checkImageData, 1000)

  // Store the interval ID for cleanup
  graph._imageCheckInterval = imageCheckInterval
}

const cleanupGraphListeners = () => {
  const graph = app?.graph as unknown as LGraph
  if (!graph) return

  graph.onNodeAdded = null
  graph.onNodeRemoved = null
  graph.onConnectionChange = null
  graph.callback_event = null

  // Clear the image check interval
  if (graph._imageCheckInterval) {
    clearInterval(graph._imageCheckInterval)
    graph._imageCheckInterval = null
  }
}

// Watch for graph initialization
watch(
  () => app?.graph,
  (newGraph) => {
    if (newGraph) {
      isGraphReady.value = true
      setupGraphListeners()
      updateNodes()
    } else {
      isGraphReady.value = false
      nodes.value = []
    }
  },
  { immediate: true }
)

onMounted(() => {
  if (app?.graph) {
    isGraphReady.value = true
    setupGraphListeners()
    updateNodes()
  }
})

onUnmounted(() => {
  cleanupGraphListeners()
})

// New helper functions for connection management
const hasConnections = (node: ComfyNode) => {
  return (
    node.inputs?.some((input) => input.link) ||
    node.outputs?.some((output) => output.links?.length)
  )
}

const getConnectionCount = (node: ComfyNode) => {
  const inputCount = node.inputs?.filter((input) => input.link)?.length || 0
  const outputCount =
    node.outputs?.reduce(
      (acc, output) => acc + (output.links?.length || 0),
      0
    ) || 0
  return inputCount + outputCount
}

const toggleConnections = (node: ComfyNode) => {
  const nodeId = String(node.id)
  if (expandedConnections.value.has(nodeId)) {
    expandedConnections.value.delete(nodeId)
  } else {
    expandedConnections.value.add(nodeId)
  }
}

const isConnectionsExpanded = (node: ComfyNode) => {
  return expandedConnections.value.has(String(node.id))
}

// Add function to check if node is Save Image
const isSaveImageNode = (node: ComfyNode) => {
  return node.type === 'SaveImage'
}

// Add function to get preview image URL
const getPreviewImageUrl = (node: ComfyNode & { _node?: any }) => {
  if (!node._node) return null

  // Use the nodeOutputStore to get image URLs
  const imageUrls = nodeOutputStore.getNodeImageUrls(node._node)
  if (imageUrls?.length) {
    return imageUrls[0]
  }

  return null
}

// Helper function to toggle node collapse
const toggleNodeCollapse = (node: ComfyNode) => {
  const nodeId = String(node.id)
  if (collapsedNodes.value.has(nodeId)) {
    collapsedNodes.value.delete(nodeId)
  } else {
    collapsedNodes.value.add(nodeId)
  }
}

const isNodeCollapsed = (node: ComfyNode) => {
  return collapsedNodes.value.has(String(node.id))
}

const handleImageClick = (node) => {
  const imageUrl = getPreviewImageUrl(node)
  if (!imageUrl) return

  allGalleryItems.value = [
    {
      url: imageUrl,
      filename: node.title || 'Image Preview',
      isImage: true,
      isVideo: false,
      isGif: false,
      isWebp: false,
      mediaType: 'images',
      supportsPreview: true
    }
  ]
  galleryActiveIndex.value = 0
}

const showConnectionsPopup = (event: Event, node: ComfyNode) => {
  selectedNode.value = node
  connectionsPanel.value?.toggle(event)
}

const getNodeColor = (node: ComfyNode & { _node?: LGraphNode }) => {
  if (!node._node) return null
  return node._node.color || null
}

const getNodeTextColor = (node: ComfyNode & { _node?: LGraphNode }) => {
  if (!node._node) return null
  // If the node has a custom text color defined, use that
  if (node._node.color_text) return node._node.color_text

  // Otherwise, if there's a background color, determine if we should use black or white text
  const bgColor = getNodeColor(node)
  if (!bgColor) return null

  // Convert hex to RGB and calculate luminance
  const hex = bgColor.replace('#', '')
  const r = parseInt(hex.substr(0, 2), 16)
  const g = parseInt(hex.substr(2, 2), 16)
  const b = parseInt(hex.substr(4, 2), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255

  // Use white text for dark backgrounds, black for light backgrounds
  return luminance > 0.5 ? '#000000' : '#ffffff'
}
</script>

<style scoped>
.stack-workflow {
  padding: 0.75rem;
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
  grid-auto-flow: dense;
  grid-auto-rows: auto;
  align-items: start;
}

/* Make Save Image nodes span 2 columns */
/* .node-card.is-save-image {
  grid-column: span 2;
} */

/* Add filter controls */
.stack-workflow-controls {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  background: var(--node-color, #1e1e1e);
  border-bottom: 1px solid var(--node-border-color, #333);
}

.filter-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
  color: var(--node-label-color, #bbb);
  user-select: none;
}

.node-card {
  background: var(--node-custom-color, var(--node-color, #1e1e1e));
  margin-bottom: 0;
  overflow: hidden;
  transition: all 0.2s ease;
  border: 1px solid var(--node-border-color, #333);
  box-shadow: 0 0 10px 0 rgba(0, 0, 0, 0.3);
  break-inside: avoid;
  page-break-inside: avoid;
  height: fit-content;
  color: var(--node-custom-text-color, var(--node-text-color, #fff));
  position: relative;
}

.node-header {
  padding: 0.5rem;
  background: color-mix(
    in srgb,
    var(--node-custom-color, var(--node-color, #1e1e1e)) 85%,
    black
  );
  cursor: pointer;
  user-select: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  transition: background-color 0.2s ease;
}

.node-header:hover {
  background: color-mix(
    in srgb,
    var(--node-custom-color, var(--node-color, #1e1e1e)) 75%,
    black
  );
}

.header-content {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.node-header h3 {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--node-custom-text-color, var(--node-header-color, #fff));
}

.connection-indicator {
  font-size: 0.75rem;
  color: var(--node-label-color, #bbb);
  background: var(--node-color, #1e1e1e);
  padding: 0.15rem 0.4rem;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    color 0.2s ease;
}

.connection-indicator:hover {
  background: var(--node-border-color, #444);
  color: var(--node-text-color, #fff);
}

.node-content {
  padding: 0.5rem 0;
  transition: max-height 0.3s ease-out;
}

.node-section {
  padding: 0.35rem 0.75rem;
}

.input-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.widget-input {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.widget-label {
  font-size: 0.75rem;
  font-weight: 500;
  color: color-mix(
    in srgb,
    var(--node-custom-text-color, var(--node-label-color, #bbb)) 85%,
    transparent
  );
  user-select: none;
}

.connection-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0;
  font-size: 0.8rem;
  color: var(--node-label-color, #bbb);
  background: none;
  border: none;
  cursor: pointer;
  user-select: none;

  /* display: none; */
}

.connection-toggle:hover {
  color: var(--node-text-color, #fff);
}

.toggle-icon {
  display: inline-block;
  transition: transform 0.15s;
  font-size: 0.7rem;
  opacity: 0.7;
}

.toggle-icon.expanded {
  transform: rotate(90deg);
}

.connections-content {
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--node-border-color, #333);
}

.connection-group {
  margin-bottom: 0.75rem;
}

.connection-group:last-child {
  margin-bottom: 0;
}

.connection-group-title {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--node-label-color, #bbb);
  margin: 0 0 0.35rem;
  user-select: none;
}

.connection-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.25rem 0;
  font-size: 0.75rem;
}

.connection-name {
  color: var(--node-text-color, #eee);
}

.connection-type {
  color: var(--node-label-color, #bbb);
  font-size: 0.7rem;
}

/* Input styling
:deep(.p-inputtext),
:deep(.p-dropdown) {
  background: var(--node-input-background, #2a2a2a);
  border: none;
  border-radius: 4px;
  color: var(--node-text-color, #eee);
  transition: background-color 0.2s ease;
}

:deep(.p-inputtext:hover),
:deep(.p-dropdown:hover) {
  background: var(--node-input-background-hover, #333);
}

:deep(.p-inputtext:focus),
:deep(.p-dropdown.p-focus) {
  background: var(--node-input-background-focus, #383838);
  box-shadow: 0 0 0 2px var(--node-selected-color, #666);
}

:deep(.p-dropdown-panel) {
  background: var(--node-input-background, #2a2a2a);
  border: none;
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

:deep(.p-dropdown-panel .p-dropdown-items) {
  padding: 0.25rem;
}

:deep(.p-dropdown-panel .p-dropdown-item) {
  padding: 0.5rem;
  color: var(--node-text-color, #eee);
  border-radius: 2px;
}

:deep(.p-dropdown-panel .p-dropdown-item:hover) {
  background: var(--node-border-color, #444);
}

:deep(.p-dropdown-panel .p-dropdown-item.p-highlight) {
  background: var(--node-selected-color, #666);
  color: var(--node-text-color, #fff);
} */

/* Textarea styling */
:deep(textarea) {
  min-height: 100px !important;
  resize: vertical !important;
  font-family: monospace;
  line-height: 1.4;
  padding: 8px;
  font-size: 0.6rem;
}

.preview-image-container {
  width: 100%;
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--node-input-background, #2a2a2a);
  overflow: hidden;
  margin: 0.5rem 0;
  border-radius: 4px;
  cursor: pointer;
  transition: opacity 0.2s ease;
}

.preview-image-container:hover {
  opacity: 0.9;
}

.preview-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.no-preview {
  color: var(--node-label-color, #bbb);
  font-size: 0.9rem;
}

:deep(.p-inputtext),
:deep(.p-dropdown),
:deep(.p-select-label),
:deep(.p-select-option-label),
:deep(textarea) {
  font-size: 0.8rem !important;
  padding: 0.5rem;
  padding-bottom: 0.4rem;
}

:deep(.connections-panel) {
  background: var(--node-color, #1e1e1e);
  border: 1px solid var(--node-border-color, #333);
  border-radius: 4px;
  padding: 0.75rem;
  min-width: 200px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}
</style>
