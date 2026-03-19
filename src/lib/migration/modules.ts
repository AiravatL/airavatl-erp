// Simplified — cutover module system removed.
// All modules are always enabled since ERP now uses only the app database.

export function isPathEnabledForCutover(_pathname: string) {
  return true;
}

export function isCutoverModuleEnabled(_moduleId: string) {
  return true;
}
