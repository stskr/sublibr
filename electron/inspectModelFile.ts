import fs from 'fs';
import path from 'path';
import { inspectLocalModelBuffer, assertRuntime, type LocalRuntime } from '../src/services/inspectLocalModel';
import { newImportedModelId } from '../src/services/importedLocalModels';
import type { ImportedLocalModel } from '../src/types';

const HEADER_BYTES = 2 * 1024 * 1024;

export function inspectImportedModelFile(filePath: string, expected: LocalRuntime): ImportedLocalModel {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(Math.min(HEADER_BYTES, 2 * 1024 * 1024));
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    const inspected = inspectLocalModelBuffer(buf.subarray(0, n), path.basename(filePath));
    assertRuntime(inspected, expected);
    return {
      id: newImportedModelId(),
      label: inspected.label,
      path: filePath,
      runtime: inspected.runtime,
      architecture: inspected.architecture,
    };
  } finally {
    fs.closeSync(fd);
  }
}
