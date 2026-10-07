export const navigate = (page: string) => {
  location.hash = `/${page}`
}

export const pageFromHash = () => location.hash.replace(/^#\/?/, '')
