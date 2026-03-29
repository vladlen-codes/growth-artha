import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8002/api'

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,   // 60s radar scan takes time
})

export default api