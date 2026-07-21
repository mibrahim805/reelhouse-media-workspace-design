const params = new URLSearchParams(window.location.search)
document.querySelector('#description').textContent =
  params.get('description') || 'The server did not respond.'

document.querySelector('#retry').addEventListener('click', () => {
  void window.reelhouseDesktop.retry()
})

document.querySelector('#settings').addEventListener('click', () => {
  void window.reelhouseDesktop.openSettings()
})
