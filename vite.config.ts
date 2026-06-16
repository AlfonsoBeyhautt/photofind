import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { driveApiPlugin } from './server/apiPlugin'

export default defineConfig({
  plugins: [react(), tailwindcss(), driveApiPlugin()],
})
