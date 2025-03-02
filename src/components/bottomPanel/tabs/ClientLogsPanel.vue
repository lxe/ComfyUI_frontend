<template>
  <div class="client-logs-panel h-full flex flex-col">
    <div class="flex justify-between items-center p-2 border-b border-surface">
      <div class="flex gap-2">
        <Button
          icon="pi pi-trash"
          severity="secondary"
          text
          @click="clearLogs"
          :aria-label="t('clientLogs.clear')"
          v-tooltip.top="{ value: t('clientLogs.clear'), showDelay: 300 }"
        />
        <Button
          :icon="autoScroll ? 'pi pi-lock' : 'pi pi-lock-open'"
          severity="secondary"
          text
          @click="autoScroll = !autoScroll"
          :aria-label="t('clientLogs.toggleAutoScroll')"
          v-tooltip.top="{
            value: t('clientLogs.toggleAutoScroll'),
            showDelay: 300
          }"
        />
      </div>
      <div class="flex gap-2">
        <ToggleButton
          v-model="filters.websocket"
          onIcon="pi pi-wifi"
          offIcon="pi pi-wifi"
          severity="secondary"
          :aria-label="t('clientLogs.toggleWebSocket')"
          v-tooltip.top="{
            value: t('clientLogs.toggleWebSocket'),
            showDelay: 300
          }"
        />
        <ToggleButton
          v-model="filters.api"
          onIcon="pi pi-globe"
          offIcon="pi pi-globe"
          severity="secondary"
          :aria-label="t('clientLogs.toggleApi')"
          v-tooltip.top="{ value: t('clientLogs.toggleApi'), showDelay: 300 }"
        />
      </div>
    </div>
    <div ref="logsContainer" class="flex-1 overflow-auto p-2 font-mono text-sm">
      <div
        v-for="log in filteredLogs"
        :key="log.timestamp"
        class="log-entry mb-1"
      >
        <span class="text-muted">{{ formatTime(log.timestamp) }}</span>
        <span :class="getTypeClass(log.type)">{{ log.message }}</span>
        <div v-if="log.details" class="pl-8 text-muted">
          {{ JSON.stringify(log.details, null, 2) }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import Button from 'primevue/button'
import ToggleButton from 'primevue/togglebutton'
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import clientLogsService from '@/services/clientLogsService'

const { t } = useI18n()

const filters = ref({
  websocket: true,
  api: true
})

const autoScroll = ref(true)
const logsContainer = ref<HTMLElement | null>(null)

const logs = clientLogsService.getLogs()

const filteredLogs = computed(() => {
  return logs.value.filter((log) => filters.value[log.type])
})

function clearLogs() {
  clientLogsService.clear()
}

function formatTime(timestamp: string) {
  const date = new Date(timestamp)
  return (
    date.toLocaleTimeString() +
    '.' +
    date.getMilliseconds().toString().padStart(3, '0')
  )
}

function getTypeClass(type: 'websocket' | 'api') {
  return (
    {
      websocket: 'text-primary ml-2',
      api: 'text-success ml-2'
    }[type] || 'ml-2'
  )
}

// Auto-scroll logic
watch(
  () => filteredLogs.value.length,
  () => {
    if (autoScroll.value && logsContainer.value) {
      nextTick(() => {
        logsContainer.value!.scrollTop = logsContainer.value!.scrollHeight
      })
    }
  }
)
</script>

<style scoped>
.log-entry {
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
