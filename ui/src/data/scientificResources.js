/**
 * BE 1 & BE 2 — Scientific Resources Data Structure, Validation & Integration
 * Provides dynamic loading and schema validation for CSA (Canadian Space Agency)
 * partner scientific resources without requiring a database or frontend rewrites
 * when new resources are added to `scientific_resources.json`.
 */

export const REQUIRED_RESOURCE_FIELDS = [
  'id',
  'title',
  'description',
  'details',
  'source',
  'url'
];

export const DEFAULT_SCIENTIFIC_RESOURCES_URL = './scientific_resources.json';

/**
 * Validates and normalizes a single scientific resource entry.
 * Ensures all 6 required fields (`id`, `title`, `description`, `details`, `source`, `url`)
 * exist and provides safe fallbacks if optional/missing fields or links occur.
 *
 * @param {Record<string, any>} rawItem
 * @param {number} index
 * @returns {{
 *   id: string,
 *   title: string,
 *   description: string,
 *   details: string,
 *   source: string,
 *   url: string | null,
 *   hasValidUrl: boolean,
 *   isValid: boolean,
 *   missingFields: string[]
 * }}
 */
export function validateScientificResource(rawItem, index = 0) {
  const item = rawItem && typeof rawItem === 'object' ? rawItem : {};
  const missingFields = [];

  for (const field of REQUIRED_RESOURCE_FIELDS) {
    const val = item[field];
    if (typeof val !== 'string' || val.trim().length === 0) {
      missingFields.push(field);
    }
  }

  const rawUrl = typeof item.url === 'string' ? item.url.trim() : '';
  let hasValidUrl = false;
  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      hasValidUrl = parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch (_) {
      hasValidUrl = false;
    }
  }

  if (!hasValidUrl && !missingFields.includes('url')) {
    missingFields.push('url');
  }

  return {
    id:
      typeof item.id === 'string' && item.id.trim()
        ? item.id.trim()
        : `resource-${index + 1}`,
    title:
      typeof item.title === 'string' && item.title.trim()
        ? item.title.trim()
        : 'Untitled Scientific Resource',
    description:
      typeof item.description === 'string' && item.description.trim()
        ? item.description.trim()
        : 'Short description unavailable for this scientific resource.',
    details:
      typeof item.details === 'string' && item.details.trim()
        ? item.details.trim()
        : typeof item.description === 'string' && item.description.trim()
          ? item.description.trim()
          : 'Detailed astronomical explanation is currently unavailable.',
    source:
      typeof item.source === 'string' && item.source.trim()
        ? item.source.trim()
        : 'CSA (Canadian Space Agency)',
    url: hasValidUrl ? rawUrl : null,
    hasValidUrl,
    isValid: missingFields.length === 0,
    missingFields
  };
}

/**
 * Validates an entire array of scientific resources from JSON.
 * Dynamically supports any number of resources so adding a 5th+ resource in
 * `scientific_resources.json` requires zero changes to frontend components.
 *
 * @param {unknown} rawData
 * @returns {{
 *   ok: boolean,
 *   count: number,
 *   validCount: number,
 *   resources: Array<ReturnType<typeof validateScientificResource>>,
 *   errors: string[]
 * }}
 */
export function validateScientificResourcesList(rawData) {
  const list = Array.isArray(rawData)
    ? rawData
    : rawData && Array.isArray(rawData.resources)
      ? rawData.resources
      : null;

  if (!list) {
    return {
      ok: false,
      count: 0,
      validCount: 0,
      resources: [],
      errors: ['Expected scientific_resources.json to contain a JSON array of resource objects.']
    };
  }

  const errors = [];
  const seenIds = new Set();
  const resources = list.map((entry, idx) => {
    const validated = validateScientificResource(entry, idx);
    if (!validated.isValid) {
      errors.push(
        `Resource [${idx}] ("${validated.id}") is missing or has invalid fields: ${validated.missingFields.join(', ')}`
      );
    }
    if (seenIds.has(validated.id)) {
      errors.push(`Duplicate resource id detected: "${validated.id}"`);
    }
    seenIds.add(validated.id);
    return validated;
  });

  const validCount = resources.filter((r) => r.isValid).length;

  return {
    ok: errors.length === 0 && resources.length > 0,
    count: resources.length,
    validCount,
    resources,
    errors
  };
}

/**
 * Loads and validates the scientific resources JSON directly from the static site.
 * Tries `./scientific_resources.json` first, then falls back to `/api/scientific-resources`
 * or `ui/src/data/scientific_resources.json` so it works seamlessly in any deployment.
 *
 * @param {string} [customUrl]
 * @returns {Promise<ReturnType<typeof validateScientificResourcesList>>}
 */
export async function loadScientificResources(customUrl = DEFAULT_SCIENTIFIC_RESOURCES_URL) {
  const candidateUrls = [
    customUrl,
    '/scientific_resources.json',
    './ui/src/data/scientific_resources.json',
    '/api/scientific-resources'
  ];

  let lastError = null;
  for (const url of candidateUrls) {
    if (!url) continue;
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        cache: 'no-cache'
      });
      if (!response.ok) {
        lastError = new Error(`HTTP ${response.status} when loading ${url}`);
        continue;
      }
      const rawJson = await response.json();
      return validateScientificResourcesList(rawJson);
    } catch (err) {
      lastError = err;
    }
  }

  return {
    ok: false,
    count: 0,
    validCount: 0,
    resources: [],
    errors: [
      lastError
        ? `Failed to load scientific_resources.json: ${lastError.message}`
        : 'Failed to load scientific_resources.json from all candidate paths.'
    ]
  };
}

/**
 * Helper to look up a single validated resource by its `id`.
 *
 * @param {string} id
 * @param {Array<ReturnType<typeof validateScientificResource>>} resources
 */
export function getScientificResourceById(id, resources = []) {
  if (!id || !Array.isArray(resources)) return null;
  return resources.find((item) => item.id === id) || null;
}

if (typeof window !== 'undefined') {
  window.SPHERExScientificResources = {
    REQUIRED_RESOURCE_FIELDS,
    validateScientificResource,
    validateScientificResourcesList,
    loadScientificResources,
    getScientificResourceById
  };
}
