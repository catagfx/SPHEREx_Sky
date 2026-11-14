/**
 * Standalone browser & ES module loader for `scientific_resources.json` (BE 1 & BE 2).
 * Can be imported via ES modules OR included via `<script type="module" src="js/scientific_resources.js"></script>`
 * without touching any existing frontend files.
 */

import {
  REQUIRED_RESOURCE_FIELDS,
  DEFAULT_SCIENTIFIC_RESOURCES_URL,
  validateScientificResource,
  validateScientificResourcesList,
  loadScientificResources,
  getScientificResourceById
} from '../ui/src/data/scientificResources.js';

export {
  REQUIRED_RESOURCE_FIELDS,
  DEFAULT_SCIENTIFIC_RESOURCES_URL,
  validateScientificResource,
  validateScientificResourcesList,
  loadScientificResources,
  getScientificResourceById
};
