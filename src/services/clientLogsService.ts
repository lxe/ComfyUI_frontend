import { Ref, ref } from 'vue'

interface ClientLog {
  timestamp: string
  type: 'websocket' | 'api'
  message: string
  details: any
}

class ClientLogsService {
  private logs: Ref<ClientLog[]>
  private maxLogs: number

  constructor() {
    this.logs = ref([])
    this.maxLogs = 1000 // Keep last 1000 logs
  }

  addLog(type: 'websocket' | 'api', message: string, details: any = null) {
    const timestamp = new Date().toISOString()
    this.logs.value.push({
      timestamp,
      type,
      message,
      details
    })

    // Trim logs if they exceed maxLogs
    if (this.logs.value.length > this.maxLogs) {
      this.logs.value = this.logs.value.slice(-this.maxLogs)
    }
  }

  logWebSocket(direction: 'in' | 'out', type: string, data: any) {
    this.addLog('websocket', `${direction === 'in' ? '←' : '→'} ${type}`, data)
  }

  logApiRequest(method: string, url: string, data: any = null) {
    this.addLog('api', `${method} ${url}`, data)
  }

  clear() {
    this.logs.value = []
  }

  getLogs(): Ref<ClientLog[]> {
    return this.logs
  }
}

// Create singleton instance
const clientLogsService = new ClientLogsService()
export default clientLogsService
