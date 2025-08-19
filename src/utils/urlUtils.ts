/**
 * Consistently merges a base URL and path, handling all slash combinations
 * @param baseUrl - The base URL (e.g., "site.com", "site.com/")
 * @param path - The path (e.g., "path/to/novel", "/path/to/novel")
 * @returns Combined URL with proper slash handling
 *
 * @example
 * mergeUrlAndPath("site.com", "path/to/novel") // "site.com/path/to/novel"
 * mergeUrlAndPath("site.com/", "path/to/novel") // "site.com/path/to/novel"
 * mergeUrlAndPath("site.com", "/path/to/novel") // "site.com/path/to/novel"
 * mergeUrlAndPath("site.com/", "/path/to/novel") // "site.com/path/to/novel"
 */
export const mergeUrlAndPath = (baseUrl: string, path: string): string => {
  if (!baseUrl || !path) {
    return baseUrl || path || '';
  }
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
};

/**
 * Extracts the path portion from a full URL given a base site URL
 * @param fullUrl - The complete URL
 * @param siteUrl - The site base URL
 * @returns The path portion
 */
export const extractPathFromUrl = (
  fullUrl: string,
  siteUrl: string,
): string => {
  if (!fullUrl || !siteUrl) {
    return fullUrl || '';
  }
  const normalizedSite = siteUrl.endsWith('/') ? siteUrl.slice(0, -1) : siteUrl;
  if (fullUrl.startsWith(normalizedSite)) {
    const path = fullUrl.substring(normalizedSite.length);
    return path.startsWith('/') ? path : path ? `/${path}` : '';
  }
  return fullUrl.startsWith('/') ? fullUrl : `/${fullUrl}`;
};

/**
 * Removes any leading and trailing slashes from a URL path
 * @param path - The URL path
 * @returns The normalized path
 *
 * @example
 * normalizePath("/path/to/novel/") // "path/to/novel"
 * normalizePath("path/to/novel") // "path/to/novel"
 * normalizePath("/path/to/novel") // "path/to/novel"
 */
export const normalizePath = (path: string): string => {
  if (!path) {
    return '';
  }
  return path.replace(/^\/|\/$/g, '');
};
