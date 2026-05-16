import type { Detector } from '../types.js';
import { defaultIgnoresDetector } from './default-ignores.js';
import { existingConfigsDetector } from './existing-configs.js';
import { monorepoDetector } from './monorepo.js';
import { packageJsonDetector } from './package-json.js';

export const DEFAULT_DETECTORS: Detector[] = [
  packageJsonDetector,
  monorepoDetector,
  existingConfigsDetector,
  defaultIgnoresDetector,
];

export { defaultIgnoresDetector, existingConfigsDetector, monorepoDetector, packageJsonDetector };
