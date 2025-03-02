import { markRaw } from 'vue'
import { useI18n } from 'vue-i18n'

import ClientLogsPanel from '@/components/bottomPanel/tabs/ClientLogsPanel.vue'
import type { BottomPanelExtension } from '@/types/extensionTypes'

export const useClientLogsTab = (): BottomPanelExtension => {
  const { t } = useI18n()
  return {
    id: 'client-logs',
    title: t('clientLogs.title'),
    component: markRaw(ClientLogsPanel),
    type: 'vue'
  }
}
