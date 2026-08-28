export interface ProjectAsset {
  id: string;
  category: "reference" | "output";
  originalFileName: string;
  path: string;
  sizeBytes: number;
  sha256: string;
  available: boolean;
}

export interface PackageAsset {
  id: string;
  category: "reference" | "output";
  originalFileName: string;
  archivePath: string;
  sizeBytes: number;
  sha256: string;
}

export interface ProjectPackageManifest {
  format: "director-project";
  formatVersion: number;
  projectSchemaVersion: number;
  appVersion: string;
  exportedAt: number;
  projectId: string;
  projectName: string;
  assets: PackageAsset[];
}

export interface ProjectImportPreview {
  projectId: string;
  projectName: string;
  formatVersion: number;
  appVersion: string;
  referenceCount: number;
  outputCount: number;
  totalSize: number;
  hasConflict: boolean;
}

export type ProjectImportStrategy = "copy" | "replace";

export interface ProjectExportOptions {
  destination: string;
  projectData: string;
  includedOutputIds: string[];
}

export interface ProjectExportReport {
  path: string;
  assetCount: number;
  totalSize: number;
  warnings: string[];
}
