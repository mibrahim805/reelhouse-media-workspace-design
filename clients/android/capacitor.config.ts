import type { CapacitorConfig } from '@capacitor/cli'

const defaultServerUrl =
  'https://pajamas-hexagon-equation.ngrok-free.dev'
const serverUrl = (process.env.REELHOUSE_SERVER_URL || defaultServerUrl).replace(
  /\/+$/,
  '',
)
const parsedServerUrl = new URL(serverUrl)

if (!['http:', 'https:'].includes(parsedServerUrl.protocol)) {
  throw new Error('REELHOUSE_SERVER_URL must use http:// or https://.')
}

const config: CapacitorConfig = {
  appId: 'com.reelhouse.app',
  appName: 'Reelhouse',
  webDir: 'www',
  appendUserAgent: 'ReelhouseAndroid/0.1.3',
  backgroundColor: '#18181b',
  loggingBehavior: 'debug',
  server: {
    url: serverUrl,
    cleartext: parsedServerUrl.protocol === 'http:',
    errorPath: 'webview-update.html',
  },
  android: {
    backgroundColor: '#18181b',
    minWebViewVersion: 111,
    webContentsDebuggingEnabled: false,
  },
}

export default config
