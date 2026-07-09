import './assets/main.css'

import logoUrl from '@logo'
import { render } from 'solid-js/web'
import App from './App'

const favicon =
  document.querySelector<HTMLLinkElement>('link[rel="icon"]') ?? document.createElement('link')
favicon.rel = 'icon'
favicon.type = 'image/svg+xml'
favicon.href = logoUrl
if (!favicon.isConnected) document.head.appendChild(favicon)

render(() => <App />, document.getElementById('root') as HTMLElement)
