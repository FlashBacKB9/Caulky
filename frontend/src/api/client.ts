import axios from 'axios'
import { apiBase, offlineEnabled } from '../offline/platform'
import { offlineAdapter } from '../offline/adapter'

const api = axios.create({ baseURL: apiBase(), withCredentials: true })

// APK: copia local de los datos y cola de cambios para usarla sin conexión
if (offlineEnabled) api.defaults.adapter = offlineAdapter

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401 && window.location.pathname !== '/login') {
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
