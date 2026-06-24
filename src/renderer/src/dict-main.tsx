import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles.css'
import { DictManagerApp } from './DictManagerApp'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <DictManagerApp />
  </React.StrictMode>
)
