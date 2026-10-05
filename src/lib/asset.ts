// Resolves /public files on any host and adds a per-build version so replaced
// images (logo, favicon, photos) always show up instead of the browser's cached copy.
export const asset = (path: string): string =>
  `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}?v=${__BUILD_ID__}`;
