new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.type === 'attributes') {
      const current = mutation.target.getAttribute('aria-current')

      if (current) {
        mutation.target.scrollIntoView({ block: 'center' })
      }
    }
  }
}).observe(document.querySelector('starlight-toc > nav > ul'), {
  attributeFilter: ['aria-current'],
  subtree: true
})
