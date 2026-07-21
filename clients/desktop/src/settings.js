const form = document.querySelector('#settings-form')
const input = document.querySelector('#server-url')
const message = document.querySelector('#message')
const meta = document.querySelector('#meta')
const openDownloads = document.querySelector('#open-downloads')

window.reelhouseDesktop.getConfig().then((config) => {
  input.value = config.serverUrl
  meta.textContent = `Downloads: ${config.downloadsDirectory} · App ${config.appVersion}`
})

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  message.textContent = 'Connecting…'
  const result = await window.reelhouseDesktop.setServerUrl(input.value)
  message.textContent = result.ok ? '' : result.error
})

openDownloads.addEventListener('click', () => {
  void window.reelhouseDesktop.openDownloads()
})
