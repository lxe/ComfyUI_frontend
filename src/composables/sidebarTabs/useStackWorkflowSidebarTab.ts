import { markRaw } from 'vue'
import { useI18n } from 'vue-i18n'

import StackWorkflowSidebarTab from '@/components/sidebar/tabs/StackWorkflowSidebarTab.vue'
import type { SidebarTabExtension } from '@/types/extensionTypes'

export const useStackWorkflowSidebarTab = (): SidebarTabExtension => {
  const { t } = useI18n()
  return {
    id: 'stack-workflow',
    icon: 'pi pi-list',
    title: t('sideToolbar.stackWorkflow'),
    tooltip: t('sideToolbar.stackWorkflow'),
    component: markRaw(StackWorkflowSidebarTab),
    type: 'vue'
  }
}
