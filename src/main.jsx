import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './contexts/AuthContext'
import { Toaster } from 'react-hot-toast'
import PortraitBlocker from './components/PortraitBlocker'
import './i18n'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <PortraitBlocker>
          <App />
        </PortraitBlocker>
        <Toaster position="bottom-right" />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
